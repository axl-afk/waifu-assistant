import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  String _url;
  final Function() onConnected;
  final Function() onDisconnected;
  final Function(Map<String, dynamic>) onMessage;

  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  bool _disposed = false;

  WebSocketService({
    required String url,
    required this.onConnected,
    required this.onDisconnected,
    required this.onMessage,
  }) : _url = url;

  void connect() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(_url));
      _channel!.stream.listen(
        (data) {
          try {
            final msg = json.decode(data as String) as Map<String, dynamic>;
            onMessage(msg);
          } catch (_) {}
        },
        onDone: _handleDisconnect,
        onError: (_) => _handleDisconnect(),
      );
      onConnected();
      _startHeartbeat();
    } catch (e) {
      _handleDisconnect();
    }
  }

  void _handleDisconnect() {
    if (_disposed) return;
    onDisconnected();
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), connect);
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      sendJson({'type': 'ping'});
    });
  }

  void sendJson(Map<String, dynamic> data) {
    try {
      _channel?.sink.add(json.encode(data));
    } catch (_) {}
  }

  void sendText(String text) {
    sendJson({'type': 'text_input', 'text': text});
  }

  void sendAudio(String base64Audio) {
    sendJson({
      'type': 'audio_input',
      'data': base64Audio,
      'mimeType': 'audio/aac',
    });
  }

  void reconnect(String newUrl) {
    _url = newUrl;
    _channel?.sink.close();
    connect();
  }

  void dispose() {
    _disposed = true;
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
  }
}