import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WaifuApp());
}

class WaifuApp extends StatelessWidget {
  const WaifuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yuki',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD9EDE2),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const AppRoot(),
    );
  }
}

class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  String _serverUrl = 'ws://localhost:8765/ws';
  bool _settingsLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
    _requestPermissions();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _serverUrl = prefs.getString('server_url') ?? 'ws://localhost:8765/ws';
      _settingsLoaded = true;
    });
  }

  Future<void> _requestPermissions() async {
    await Permission.microphone.request();
  }

  @override
  Widget build(BuildContext context) {
    if (!_settingsLoaded) {
      return const Scaffold(
        backgroundColor: Color(0xFFD9EDE2),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return HomeScreen(serverUrl: _serverUrl);
  }
}