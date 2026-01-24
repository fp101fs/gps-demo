import { File, Paths } from 'expo-file-system/next';

const LOG_FILE_PATH = Paths.document + '/app-logs.txt';
const logFile = new File(LOG_FILE_PATH);

export const logger = {
  async log(emoji: string, category: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    const line = `[${timestamp}] ${emoji} [${category}] ${message}${dataStr}\n`;

    console.log(line.trim());

    try {
      const existing = logFile.exists ? logFile.text() : '';
      logFile.write(existing + line);
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
  getLogPath: () => LOG_FILE_PATH,

  // Clear logs
  clear() {
    try {
      logFile.write('');
    } catch (e) {}
  },

  // Read all logs
  readAll(): string {
    try {
      return logFile.exists ? logFile.text() : '';
    } catch (e) {
      return '';
    }
  }
};
