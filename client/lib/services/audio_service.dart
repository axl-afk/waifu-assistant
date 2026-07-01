import 'dart:convert';
import 'dart:io';
import 'package:record/record.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

class AudioService {
  final Function(String base64Audio) onAudioData;
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  String? _recordingPath;

  AudioService({required this.onAudioData});

  Future<void> startRecording() async {
    final dir = await getTemporaryDirectory();
    _recordingPath = '${dir.path}/yuki_input.aac';
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        sampleRate: 16000,
        numChannels: 1,
      ),
      path: _recordingPath!,
    );
  }

  Future<void> stopRecording() async {
    final path = await _recorder.stop();
    if (path == null) return;
    final bytes = await File(path).readAsBytes();
    final base64Audio = base64Encode(bytes);
    onAudioData(base64Audio);
  }

  Future<void> playBase64Audio(String base64Data) async {
    try {
      final bytes = base64Decode(base64Data);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/yuki_output.wav');
      await file.writeAsBytes(bytes);
      await _player.setFilePath(file.path);
      await _player.play();
    } catch (e) {
      print('Audio play error: $e');
    }
  }

  void dispose() {
    _recorder.dispose();
    _player.dispose();
  }
}