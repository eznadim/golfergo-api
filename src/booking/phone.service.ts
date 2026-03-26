import { Injectable } from '@nestjs/common';

@Injectable()
export class PhoneService {
  normalizePhoneNumber(phoneNumber: string) {
    const digits = phoneNumber.replace(/[^\d]/g, '');

    if (digits.startsWith('60')) {
      return `+${digits}`;
    }

    if (digits.startsWith('0')) {
      return `+60${digits.slice(1)}`;
    }

    return `+${digits}`;
  }
}
