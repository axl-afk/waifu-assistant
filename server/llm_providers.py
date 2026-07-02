"""
Pluggable LLM provider layer.

This lets the user pick ANY backend in config.py by setting LLM_PROVIDER,
without touching main.py:

    LLM_PROVIDER = "openai"     # OpenAI, OpenRouter, Groq, Together, Azure...
    LLM_PROVIDER = "local"      # Ollama / LM Studio / vLLM / llama.cpp server
                                 # (anything that speaks the OpenAI HTTP API)
    LLM_PROVIDER = "gemini"     # Google Gemini
    LLM_PROVIDER = "anthropic"  # Claude

Every provider exposes the same two async methods, so main.py never needs
to know which one is active:

    check_tools(messages, tools, tool_prompt) -> list[ToolCall]
    stream_chat(messages, max_tokens, temperature) -> async generator[str]

`messages` is our own provider-agnostic format, a list of dicts:
    {"role": "system" | "user" | "assistant", "content": "..."}

To add another backend (e.g. Mistral, Cohere, a bespoke local server),
subclass LLMProvider, implement the two methods, and add it to PROVIDERS
at the bottom of the file.
"""

import json
from abc import ABC, abstractmethod


class ToolCall:
    """Normalized tool call, independent of which provider produced it."""
    def __init__(self, id, name, arguments: dict):
        self.id = id
        self.name = name
        self.arguments = arguments or {}

    def __repr__(self):
        return f"ToolCall({self.name}, {self.arguments})"


class LLMProvider(ABC):
    def __init__(self, config):
        self.config = config

    @abstractmethod
    async def check_tools(self, messages, tools, tool_prompt):
        """Non-streaming call. Returns a list of ToolCall (possibly empty)."""
        raise NotImplementedError

    @abstractmethod
    async def stream_chat(self, messages, max_tokens, temperature):
        """Async generator yielding text token strings."""
        raise NotImplementedError
        yield  # pragma: no cover  (keeps this a generator for subclasses' super() calls)


# ──────────────────────────────────────────────────────────────────────────
# OpenAI-compatible (covers OpenAI itself AND any local/offline server that
# mimics the OpenAI API — Ollama, LM Studio, text-generation-webui, vLLM,
# llama.cpp's server, OpenRouter, Groq, etc. Only base_url/api_key differ.)
# ──────────────────────────────────────────────────────────────────────────
class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, config):
        super().__init__(config)
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(
            base_url=config.LLM_BASE_URL,
            api_key=config.LLM_API_KEY or "not-needed",  # local servers often ignore this
        )
        self.model = config.LLM_MODEL

    async def check_tools(self, messages, tools, tool_prompt):
        wire_messages = [{"role": "system", "content": tool_prompt}] + [
            {"role": m["role"], "content": m["content"]} for m in messages
        ]
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=wire_messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=300,
            temperature=0.1,
        )
        tool_calls = response.choices[0].message.tool_calls or []
        calls = []
        for call in tool_calls:
            try:
                args = json.loads(call.function.arguments)
            except Exception:
                args = {}
            calls.append(ToolCall(id=call.id, name=call.function.name, arguments=args))
        return calls

    async def stream_chat(self, messages, max_tokens, temperature):
        wire_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=wire_messages,
            stream=True,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                yield token


# ──────────────────────────────────────────────────────────────────────────
# Google Gemini
# ──────────────────────────────────────────────────────────────────────────
class GeminiProvider(LLMProvider):
    def __init__(self, config):
        super().__init__(config)
        import google.generativeai as genai
        genai.configure(api_key=config.GEMINI_API_KEY)
        self._genai = genai
        self.model_name = config.GEMINI_MODEL

    @staticmethod
    def _convert_tools(tools):
        declarations = []
        for t in tools:
            fn = t["function"]
            declarations.append({
                "name": fn["name"],
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {"type": "object", "properties": {}}),
            })
        return declarations

    @staticmethod
    def _convert_messages(messages):
        """Split out the system prompt (Gemini takes it separately) and
        convert user/assistant turns into Gemini's role/parts format."""
        system_text = ""
        history = []
        for m in messages:
            if m["role"] == "system":
                system_text += m["content"] + "\n"
            elif m["role"] == "user":
                history.append({"role": "user", "parts": [m["content"] or ""]})
            elif m["role"] == "assistant":
                history.append({"role": "model", "parts": [m["content"] or ""]})
        return system_text.strip(), history

    async def check_tools(self, messages, tools, tool_prompt):
        system_text, history = self._convert_messages(
            [{"role": "system", "content": tool_prompt}] + messages
        )
        model = self._genai.GenerativeModel(
            self.model_name,
            system_instruction=system_text,
            tools=[{"function_declarations": self._convert_tools(tools)}],
        )
        response = await model.generate_content_async(history)
        calls = []
        for cand in response.candidates:
            for part in cand.content.parts:
                fc = getattr(part, "function_call", None)
                if fc and fc.name:
                    calls.append(ToolCall(id=fc.name, name=fc.name, arguments=dict(fc.args)))
        return calls

    async def stream_chat(self, messages, max_tokens, temperature):
        system_text, history = self._convert_messages(messages)
        model = self._genai.GenerativeModel(
            self.model_name,
            system_instruction=system_text,
            generation_config={
                "max_output_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        response = await model.generate_content_async(history, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text


# ──────────────────────────────────────────────────────────────────────────
# Anthropic Claude
# ──────────────────────────────────────────────────────────────────────────
class AnthropicProvider(LLMProvider):
    def __init__(self, config):
        super().__init__(config)
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = config.ANTHROPIC_MODEL

    @staticmethod
    def _convert_tools(tools):
        out = []
        for t in tools:
            fn = t["function"]
            out.append({
                "name": fn["name"],
                "description": fn.get("description", ""),
                "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
            })
        return out

    @staticmethod
    def _convert_messages(messages):
        system_text = ""
        converted = []
        for m in messages:
            if m["role"] == "system":
                system_text += m["content"] + "\n"
            elif m["role"] in ("user", "assistant"):
                converted.append({"role": m["role"], "content": m["content"] or ""})
        return system_text.strip(), converted

    async def check_tools(self, messages, tools, tool_prompt):
        system_text, converted = self._convert_messages(
            [{"role": "system", "content": tool_prompt}] + messages
        )
        if not converted:
            converted = [{"role": "user", "content": "(no prior context)"}]
        response = await self.client.messages.create(
            model=self.model,
            system=system_text,
            messages=converted,
            tools=self._convert_tools(tools),
            max_tokens=300,
        )
        calls = []
        for block in response.content:
            if block.type == "tool_use":
                calls.append(ToolCall(id=block.id, name=block.name, arguments=block.input))
        return calls

    async def stream_chat(self, messages, max_tokens, temperature):
        system_text, converted = self._convert_messages(messages)
        async with self.client.messages.stream(
            model=self.model,
            system=system_text,
            messages=converted,
            max_tokens=max_tokens,
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                yield text


# ──────────────────────────────────────────────────────────────────────────
# Factory
# ──────────────────────────────────────────────────────────────────────────
PROVIDERS = {
    "openai": OpenAICompatibleProvider,
    "local": OpenAICompatibleProvider,   # Ollama / LM Studio / vLLM / etc.
    "gemini": GeminiProvider,
    "anthropic": AnthropicProvider,
}


def get_provider(config):
    name = getattr(config, "LLM_PROVIDER", "openai").lower()
    cls = PROVIDERS.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{name}'. Choose one of: {', '.join(PROVIDERS)}"
        )
    return cls(config)
