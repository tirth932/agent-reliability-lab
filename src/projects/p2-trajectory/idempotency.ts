export function refundIdempotencyKey(orderId: number, requestId: string): string {
  return `refund:${orderId}:${requestId}`;
}
