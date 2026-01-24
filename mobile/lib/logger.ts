import * as FileSystem from 'expo-file-system';

const LOG_FILE = FileSystem.documentDirectory + 'app-logs.txt';

export const logger = {
  async log(emoji: string, category: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    const line = `[${timestamp}] ${emoji} [${category}] ${message}${dataStr}\n`;

    console.log(line.trim());

    try {
      const existing = await FileSystem.readAsStringAsync(LOG_FILE).catch(() => '');
      await FileSystem.writeAsStringAsync(LOG_FILE, existing + line);
    } catch (e) {
      // Silently fail - logging should never break the app
    }
  },

  // Convenience methods
  fleet: (msg: string, data?: any) => logger.log('🏠', 'FLEET', msg, data),
  location: (msg: string, data?: any) => logger.log('📍', 'LOCATION', msg, data),
  realtime: (msg: string, data?: any) => logger.log('🔄', 'REALTIME', msg, data),
  auth: (msg: string, data?: any) => logger.log('🔐', 'AUTH', msg, data),
  error: (msg: string, data?: any) => logger.log('❌', 'ERROR', msg, data),
  success: (msg: string, data?: any) => logger.log('✅', 'SUCCESS', msg, data),

  // Get log file path for reading
  getLogPath: () => LOG_FILE,

  // Clear logs
  async clear() {
    try {
      await FileSystem.writeAsStringAsync(LOG_FILE, '');
    } catch (e) {}
  },

  // Read all logs
  async readAll(): Promise<string> {
    try {
      return await FileSystem.readAsStringAsync(LOG_FILE);
    } catch (e) {
      return '';
    }
  }
};
