import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

type BookingNotificationPlayer = {
  name: string;
  phoneNumber: string;
};

type BookingNotificationPayload = {
  bookingRef: string;
  clubName: string;
  clubEmail: string | null;
  bookingDate: string;
  teeTime: string;
  playerCount: number;
  grandTotal: number;
  currency: string;
  players: BookingNotificationPlayer[];
};

@Injectable()
export class BookingNotificationService {
  private readonly logger = new Logger(BookingNotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendBookingConfirmed(payload: BookingNotificationPayload) {
    await Promise.allSettled([
      this.sendWhatsappConfirmations(payload),
      this.sendClubEmail(payload),
    ]).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') {
          this.logger.warn(
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          );
        }
      });
    });
  }

  private async sendWhatsappConfirmations(payload: BookingNotificationPayload) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from =
      this.config.get<string>('TWILIO_WHATSAPP_FROM') ??
      'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials are not configured');
      return;
    }

    const uniquePhones = [
      ...new Set(
        payload.players.map((player) => player.phoneNumber).filter(Boolean),
      ),
    ];

    await Promise.all(
      uniquePhones.map((phoneNumber) =>
        this.sendTwilioWhatsappMessage(
          accountSid,
          authToken,
          from,
          phoneNumber,
          this.buildPlayerMessage(payload),
        ),
      ),
    );
  }

  private async sendTwilioWhatsappMessage(
    accountSid: string,
    authToken: string,
    from: string,
    phoneNumber: string,
    message: string,
  ) {
    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:${phoneNumber}`,
      Body: message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`,
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Unable to send WhatsApp booking confirmation: ${
          text || response.statusText
        }`,
      );
    }
  }

  private async sendClubEmail(payload: BookingNotificationPayload) {
    if (!payload.clubEmail) {
      this.logger.warn(`Club email is missing for ${payload.clubName}`);
      return;
    }

    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from =
      this.config.get<string>('SMTP_FROM') ??
      this.config.get<string>('SMTP_USER');

    if (!host || !from) {
      this.logger.warn('SMTP settings are not configured');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: payload.clubEmail,
      subject: `New GolfKakis booking ${payload.bookingRef}`,
      text: this.buildClubEmail(payload),
    });
  }

  private buildPlayerMessage(payload: BookingNotificationPayload) {
    return [
      `GolfKakis booking confirmed: ${payload.bookingRef}`,
      `Club: ${payload.clubName}`,
      `Date: ${payload.bookingDate}`,
      `Tee time: ${payload.teeTime}`,
      `Players: ${payload.playerCount}`,
      `Estimated total: ${payload.currency} ${payload.grandTotal.toFixed(2)}`,
    ].join('\n');
  }

  private buildClubEmail(payload: BookingNotificationPayload) {
    const playerLines = payload.players
      .map(
        (player, index) =>
          `${index + 1}. ${player.name} (${player.phoneNumber})`,
      )
      .join('\n');

    return [
      `A new GolfKakis booking has been confirmed.`,
      '',
      `Booking ref: ${payload.bookingRef}`,
      `Club: ${payload.clubName}`,
      `Date: ${payload.bookingDate}`,
      `Tee time: ${payload.teeTime}`,
      `Players: ${payload.playerCount}`,
      `Estimated total: ${payload.currency} ${payload.grandTotal.toFixed(2)}`,
      '',
      'Players:',
      playerLines,
    ].join('\n');
  }
}
