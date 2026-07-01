import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends StatefulWidget {
  final String currentUrl;
  final Function(String) onSave;

  const SettingsScreen({
    super.key,
    required this.currentUrl,
    required this.onSave,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlController;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: widget.currentUrl);
  }

  Future<void> _save() async {
    final url = _urlController.text.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_url', url);
    widget.onSave(url);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFD9EDE2),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Settings'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Server URL',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            const Text(
              'Enter the WebSocket URL of your Yuki server.\n'
              'Local: ws://localhost:8765/ws\n'
              'Home PC (Tailscale): ws://100.x.x.x:8765/ws',
              style: TextStyle(fontSize: 13, color: Colors.black54),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.white.withOpacity(0.6),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                hintText: 'ws://localhost:8765/ws',
              ),
            ),
            const SizedBox(height: 24),

            // Preset buttons
            const Text(
              'Quick presets',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _PresetChip(
                  label: 'Localhost',
                  url: 'ws://localhost:8765/ws',
                  onTap: (url) => _urlController.text = url,
                ),
                _PresetChip(
                  label: 'Home PC (Tailscale)',
                  url: 'ws://100.64.0.1:8765/ws',
                  onTap: (url) => _urlController.text = url,
                ),
              ],
            ),
            const SizedBox(height: 32),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFF6B9D),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                child: const Text(
  'Save & Connect',
  style: TextStyle(
    fontSize: 16,
  ),
)
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PresetChip extends StatelessWidget {
  final String label;
  final String url;
  final Function(String) onTap;

  const _PresetChip({
    required this.label,
    required this.url,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label),
      onPressed: () => onTap(url),
      backgroundColor: Colors.white.withOpacity(0.5),
    );
  }
}