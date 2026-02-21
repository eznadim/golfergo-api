import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloService {
  getHello() {
    return {
      message: 'Hello World',
      timestamp: new Date().toISOString(),
      service: 'golfergo-api',
    };
  }
}