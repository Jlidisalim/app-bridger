import { v4 as uuidv4 } from 'uuid';
import config from '../config/env';

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class Logger {
  private isDevelopment = config.server.nodeEnv === 'development';

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private write(entry: LogEntry): void {
    const formatted = this.formatLog(entry);
    
    if (this.isDevelopment) {
      const color = entry.level === 'error' ? '\x1b[31m' : 
                   entry.level === 'warn' ? '\x1b[33m' : 
                   entry.level === 'info' ? '\x1b[36m' : '\x1b[90m';
      console.log(`${color}${formatted}\x1b[0m`);
    } else {
      console.log(formatted);
    }
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (this.isDevelopment) {
      this.write({
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        ...metadata,
      });
    }
  }

  // Request logger middleware helper
  requestLogger(req: any, res: any, duration: number): void {
    this.info('HTTP Request', {
      requestId: req.requestId,
      userId: req.user?.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
  }

  // Generate request ID
  generateRequestId(): string {
    return uuidv4();
  }
}

export const logger = new Logger();
export default logger;
