import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface TripLeg {
  confirmationId: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  seatCount: number;
  priceDisplay: string;
}

interface BookingEmailParams {
  to: string;
  passengerName: string;
  // Outbound leg (always present)
  outbound: TripLeg;
  // Inbound leg (only for round trips)
  inbound?: TripLeg;
  totalPriceDisplay: string;
}

function buildTripCard(leg: TripLeg, label?: string): string {
  const formattedDate = new Date(leg.departureDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const labelHtml = label
    ? `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;">${label}</p>`
    : "";

  return `
    ${labelHtml}
    <div style="background:#09090b;border-radius:10px;padding:20px 24px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;">${leg.origin} → ${leg.destination}</p>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
        <span style="font-size:18px;font-weight:600;color:#fff;">${leg.departureTime}</span>
        <span style="color:#52525b;">→</span>
        <span style="font-size:18px;font-weight:600;color:#fff;">${leg.arrivalTime}</span>
      </div>
      <p style="margin:4px 0 0;font-size:13px;color:#a1a1aa;">${formattedDate}</p>
    </div>
  `;
}

export async function sendBookingConfirmation(params: BookingEmailParams) {
  const { to, passengerName, outbound, inbound, totalPriceDisplay } = params;

  const isRoundTrip = !!inbound;
  const manageUrl = `${appUrl}/manage?id=${outbound.confirmationId}`;

  const tripCardsHtml = isRoundTrip
    ? buildTripCard(outbound, "Outbound") + buildTripCard(inbound!, "Return")
    : buildTripCard(outbound);

  const detailsHtml = isRoundTrip
    ? `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px 0;color:#71717a;">Outbound Confirmation</td>
          <td style="padding:10px 0;text-align:right;font-family:monospace;font-weight:600;color:#09090b;">${outbound.confirmationId}</td>
        </tr>
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px 0;color:#71717a;">Return Confirmation</td>
          <td style="padding:10px 0;text-align:right;font-family:monospace;font-weight:600;color:#09090b;">${inbound!.confirmationId}</td>
        </tr>
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px 0;color:#71717a;">Passengers</td>
          <td style="padding:10px 0;text-align:right;font-weight:500;color:#09090b;">${outbound.seatCount}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#71717a;">Total Paid</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;color:#09090b;">${totalPriceDisplay}</td>
        </tr>
      </table>
    `
    : `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px 0;color:#71717a;">Confirmation ID</td>
          <td style="padding:10px 0;text-align:right;font-family:monospace;font-weight:600;color:#09090b;">${outbound.confirmationId}</td>
        </tr>
        <tr style="border-bottom:1px solid #f4f4f5;">
          <td style="padding:10px 0;color:#71717a;">Passengers</td>
          <td style="padding:10px 0;text-align:right;font-weight:500;color:#09090b;">${outbound.seatCount}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#71717a;">Total Paid</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;color:#09090b;">${totalPriceDisplay}</td>
        </tr>
      </table>
    `;

  const subjectRoute = isRoundTrip
    ? `${outbound.origin} ↔ ${outbound.destination}`
    : `${outbound.origin} → ${outbound.destination}`;

  const formattedOutboundDate = new Date(outbound.departureDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  await transporter.sendMail({
    from: `"Mitchel Rifae's Shuttle Booking" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Booking Confirmed — ${subjectRoute} on ${formattedOutboundDate}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;">

          <!-- Header -->
          <div style="background:#000;padding:24px 32px;">
            <span style="color:#fff;font-size:18px;font-weight:bold;">Mitchel Rifae's</span>
            <span style="color:#facc15;font-size:18px;font-weight:bold;"> Shuttle Booking</span>
          </div>

          <!-- Body -->
          <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

            <!-- Top section -->
            <div style="padding:32px 32px 24px;">
              <p style="margin:0 0 4px;font-size:14px;color:#71717a;">Booking Confirmed ✓</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#09090b;">
                Hi ${passengerName}, you're all set!
              </h1>

              ${tripCardsHtml}

              ${detailsHtml}
            </div>

            <!-- Manage link -->
            <div style="background:#f4f4f5;padding:20px 32px;text-align:center;">
              <p style="margin:0 0 12px;font-size:13px;color:#71717a;">
                Need to change or cancel your trip?
              </p>
              <a href="${manageUrl}"
                style="display:inline-block;background:#facc15;color:#000;font-weight:600;font-size:14px;padding:10px 24px;border-radius:8px;text-decoration:none;">
                Manage My Booking
              </a>
            </div>

          </div>

          <!-- Footer -->
          <div style="text-align:center;padding:24px;font-size:12px;color:#a1a1aa;">
            © ${new Date().getFullYear()} Mitchel Rifae's Shuttle Booking. All rights reserved.
          </div>

        </body>
      </html>
    `,
  });
}
