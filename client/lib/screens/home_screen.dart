import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../services/websocket_service.dart';
import '../services/audio_service.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  final String serverUrl;
  const HomeScreen({super.key, required this.serverUrl});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  InAppWebViewController? _webViewController;
  late WebSocketService _wsService;
  late AudioService _audioService;

  bool _isRecording = false;
  bool _isConnected = false;
  bool _autoListen = false;
  String _status = 'Connecting...';
  final TextEditingController _inputController = TextEditingController();

  // Server URL for the renderer
  // When running locally, the renderer runs on port 5173
  // On a real device connecting to home PC, this would be the PC's IP
  String get _rendererUrl {
    final wsUrl = widget.serverUrl;
    final host = wsUrl
        .replaceAll('ws://', '')
        .replaceAll('wss://', '')
        .split(':')[0];
    return 'http://$host:5173';
  }

  @override
  void initState() {
    super.initState();
    _wsService = WebSocketService(
      url: widget.serverUrl,
      onConnected: () => setState(() {
        _isConnected = true;
        _status = 'Connected ✨';
      }),
      onDisconnected: () => setState(() {
        _isConnected = false;
        _status = 'Reconnecting...';
      }),
      onMessage: _handleServerMessage,
    );
    _audioService = AudioService(
      onAudioData: (data) => _wsService.sendAudio(data),
    );
    _wsService.connect();
  }

  void _handleServerMessage(Map<String, dynamic> msg) {
    final type = msg['type'] as String;
    switch (type) {
      case 'avatar_cmd':
        _webViewController?.evaluateJavascript(
          source: 'waifuAPI.setEmotion("${msg['emotion']}")',
        );
        if (msg['motion'] != null) {
          _webViewController?.evaluateJavascript(
            source: 'waifuAPI.playMotion("${msg['motion']}")',
          );
        }
        break;
      case 'llm_token':
        // tokens shown in chat bubbles handled by renderer
        break;
      case 'audio':
        _audioService.playBase64Audio(msg['data'] as String);
        break;
      case 'transcript':
        setState(() => _inputController.text = msg['text'] as String);
        break;
      case 'status':
        setState(() => _status = msg['text'] as String);
        break;
      case 'done':
        if (_autoListen) _startAutoListen();
        break;
    }
  }

  void _startAutoListen() async {
    await Future.delayed(const Duration(milliseconds: 600));
    if (_autoListen && mounted) {
      await _startRecording();
      await Future.delayed(const Duration(seconds: 5));
      if (_isRecording) await _stopRecording();
    }
  }

  Future<void> _startRecording() async {
    await _audioService.startRecording();
    setState(() {
      _isRecording = true;
      _status = 'Listening... 🎤';
    });
  }

  Future<void> _stopRecording() async {
    await _audioService.stopRecording();
    setState(() {
      _isRecording = false;
      _status = 'Processing... 🎤';
    });
  }

  void _sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _wsService.sendText(text);
    _inputController.clear();
  }

  @override
  void dispose() {
    _wsService.dispose();
    _audioService.dispose();
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFD9EDE2),
      body: Stack(
        children: [
          // ── 3D Avatar WebView ────────────────────────────
          Positioned.fill(
            child: InAppWebView(
              initialUrlRequest: URLRequest(
                url: WebUri(_rendererUrl),
              ),
              initialSettings: InAppWebViewSettings(
                mediaPlaybackRequiresUserGesture: false,
                allowsInlineMediaPlayback: true,
                transparentBackground: true,
                hardwareAcceleration: true,
              ),
              onWebViewCreated: (controller) {
                _webViewController = controller;
              },
              onLoadStop: (controller, url) {
                // Inject bridge so WebView can talk back to Flutter
                controller.evaluateJavascript(source: '''
                  window.flutterBridge = {
                    sendMessage: function(msg) {
                      window.flutter_inappwebview.callHandler("onMessage", msg);
                    }
                  };
                ''');
              },
            ),
          ),

          // ── Status bar ───────────────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 0, right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _status,
                  style: const TextStyle(fontSize: 13, color: Colors.black87),
                ),
              ),
            ),
          ),

          // ── Settings button ──────────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 16,
            child: IconButton(
              icon: const Icon(Icons.settings, color: Colors.black54),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => SettingsScreen(
                    currentUrl: widget.serverUrl,
                    onSave: (url) {
                      _wsService.reconnect(url);
                    },
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom input bar ─────────────────────────────
          Positioned(
            bottom: MediaQuery.of(context).padding.bottom + 16,
            left: 16, right: 16,
            child: Row(
              children: [
                // Text input
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.5),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: TextField(
                      controller: _inputController,
                      decoration: const InputDecoration(
                        hintText: 'Talk to Yuki...',
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12,
                        ),
                      ),
                      onSubmitted: _sendMessage,
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Send button
                _CircleBtn(
                  icon: Icons.send,
                  color: Colors.white54,
                  onTap: () => _sendMessage(_inputController.text),
                ),
                const SizedBox(width: 8),

                // Mic button
                GestureDetector(
                  onTapDown: (_) => _startRecording(),
                  onTapUp: (_) => _stopRecording(),
                  onTapCancel: () => _stopRecording(),
                  child: _CircleBtn(
                    icon: _isRecording ? Icons.mic : Icons.mic_none,
                    color: _isRecording
                        ? Colors.pinkAccent.withOpacity(0.8)
                        : Colors.white54,
                    onTap: null,
                  ),
                ),
                const SizedBox(width: 8),

                // Auto listen toggle
                _CircleBtn(
                  icon: _autoListen ? Icons.loop : Icons.loop_outlined,
                  color: _autoListen
                      ? Colors.pinkAccent.withOpacity(0.8)
                      : Colors.white54,
                  onTap: () => setState(() => _autoListen = !_autoListen),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _CircleBtn({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48, height: 48,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.black87, size: 22),
      ),
    );
  }
}