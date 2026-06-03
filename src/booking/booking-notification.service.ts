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

type NotificationChannelResult = {
  status: 'sent' | 'skipped' | 'failed';
  detail?: string;
};

@Injectable()
export class BookingNotificationService {
  private readonly logger = new Logger(BookingNotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendBookingConfirmed(payload: BookingNotificationPayload) {
    const [whatsappResult, clubEmailResult] = await Promise.allSettled([
      this.sendWhatsappConfirmations(payload),
      this.sendClubEmail(payload),
    ]);

    const result = {
      whatsapp:
        whatsappResult.status === 'fulfilled'
          ? whatsappResult.value
          : this.toFailedResult(whatsappResult.reason),
      clubEmail:
        clubEmailResult.status === 'fulfilled'
          ? clubEmailResult.value
          : this.toFailedResult(clubEmailResult.reason),
    };

    this.logger.log(
      `Booking notification result for ${payload.bookingRef}: WhatsApp=${result.whatsapp.status}${
        result.whatsapp.detail ? ` (${result.whatsapp.detail})` : ''
      }, ClubEmail=${result.clubEmail.status}${
        result.clubEmail.detail ? ` (${result.clubEmail.detail})` : ''
      }`,
    );

    return result;
  }

  private async sendWhatsappConfirmations(
    payload: BookingNotificationPayload,
  ): Promise<NotificationChannelResult> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from =
      this.config.get<string>('TWILIO_WHATSAPP_FROM') ??
      'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials are not configured');
      return { status: 'skipped', detail: 'Twilio credentials missing' };
    }

    const uniquePhones = [
      ...new Set(
        payload.players.map((player) => player.phoneNumber).filter(Boolean),
      ),
    ];

    if (uniquePhones.length === 0) {
      return { status: 'skipped', detail: 'No player phone numbers' };
    }

    const results = await Promise.allSettled(
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

    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      const details = failed
        .map((result) =>
          result.status === 'rejected' ? this.errorMessage(result.reason) : '',
        )
        .filter(Boolean)
        .join(' | ');
      return {
        status: 'failed',
        detail: details || `${failed.length} WhatsApp message(s) failed`,
      };
    }

    return {
      status: 'sent',
      detail: `${uniquePhones.length} recipient(s)`,
    };
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

  private async sendClubEmail(
    payload: BookingNotificationPayload,
  ): Promise<NotificationChannelResult> {
    if (!payload.clubEmail) {
      this.logger.warn(`Club email is missing for ${payload.clubName}`);
      return { status: 'skipped', detail: 'Club email missing' };
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
      return { status: 'skipped', detail: 'SMTP settings missing' };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    const sent = await transporter.sendMail({
      from,
      to: payload.clubEmail,
      subject: `New GolfKakis booking ${payload.bookingRef}`,
      text: this.buildClubEmail(payload),
    });

    return {
      status: 'sent',
      detail: `to=${payload.clubEmail}, messageId=${sent.messageId ?? 'n/a'}`,
    };
  }

  private toFailedResult(error: unknown): NotificationChannelResult {
    return {
      status: 'failed',
      detail: this.errorMessage(error),
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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
