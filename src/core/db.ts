import { createClient, type Client, type ResultSet } from "@libsql/client";
import seedJson from "../../data/orders.seed.json";
import { ORDER_STATUSES, type Order, type OrderStatus, type RefundRow, type TicketRow } from "./types";

export type SeedOrder = Order;

const STATUSES = new Set<string>(ORDER_STATUSES);

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new Error(`Expected a number from SQLite, got ${typeof value}`);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function rowsOf(result: ResultSet): Record<string, unknown>[] {
  return result.rows.map((row) => {
    const record = row as unknown as Record<string, unknown>;
    const named: Record<string, unknown> = {};
    for (const column of result.columns) named[column] = record[column];
    return named;
  });
}

function toOrder(row: Record<string, unknown>): Order {
  const status = asText(row.status);
  if (!STATUSES.has(status)) throw new Error(`Unknown order status "${status}"`);
  return {
    id: asNumber(row.id),
    customer: asText(row.customer),
    amount: asNumber(row.amount),
    status: status as OrderStatus,
    address: asText(row.address),
  };
}

function toRefund(row: Record<string, unknown>): RefundRow {
  const key = row.idempotency_key;
  return {
    id: asNumber(row.id),
    order_id: asNumber(row.order_id),
    amount: asNumber(row.amount),
    idempotency_key: key == null ? null : asText(key),
    created_at: asText(row.created_at),
  };
}

function toTicket(row: Record<string, unknown>): TicketRow {
  return {
    id: asNumber(row.id),
    reason: asText(row.reason),
    conversation: asText(row.conversation),
    trace: asText(row.trace),
    created_at: asText(row.created_at),
  };
}

export class IdempotencyConflict extends Error {
  constructor() {
    super("idempotency conflict");
    this.name = "IdempotencyConflict";
  }
}

export type Db = {
  idempotentRefunds: boolean;
  allOrders(): Promise<Order[]>;
  getOrder(id: number): Promise<Order | null>;
  searchOrders(customer: string): Promise<Order[]>;
  customerNames(): Promise<string[]>;
  insertRefund(input: { orderId: number; amount: number; idempotencyKey: string | null }): Promise<RefundRow>;
  findRefundByKey(key: string): Promise<RefundRow | null>;
  listRefunds(): Promise<RefundRow[]>;
  updateAddress(id: number, address: string): Promise<void>;
  insertTicket(input: { reason: string; conversation: string; trace: string }): Promise<TicketRow>;
  listTickets(): Promise<TicketRow[]>;
  duplicateRefundOrders(): Promise<{ order_id: number; count: number }[]>;
  close(): void;
};

export function loadSeed(seed: readonly SeedOrder[] = seedJson as SeedOrder[]): SeedOrder[] {
  if (seed.length !== 20) throw new Error(`Seed must contain 20 orders, found ${seed.length}`);
  const ids = seed.map((order) => order.id);
  for (let id = 4510; id <= 4529; id += 1) {
    if (!ids.includes(id)) throw new Error(`Seed is missing order ${id}`);
  }
  for (const order of seed) {
    if (!STATUSES.has(order.status)) throw new Error(`Bad status on order ${order.id}`);
  }
  return seed.map((order) => ({ ...order }));
}

export async function createDb(options: {
  idempotentRefunds: boolean;
  seed?: readonly SeedOrder[];
}): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      address TEXT NOT NULL
    );
    CREATE TABLE refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      idempotency_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reason TEXT NOT NULL,
      conversation TEXT NOT NULL,
      trace TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  if (options.idempotentRefunds) {
    await client.execute(
      "CREATE UNIQUE INDEX refunds_idempotency_key ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL",
    );
  }
  for (const order of loadSeed(options.seed)) {
    await client.execute({
      sql: "INSERT INTO orders (id, customer, amount, status, address) VALUES (?, ?, ?, ?, ?)",
      args: [order.id, order.customer, order.amount, order.status, order.address],
    });
  }
  return bindDb(client, options.idempotentRefunds);
}

function bindDb(client: Client, idempotentRefunds: boolean): Db {
  return {
    idempotentRefunds,
    async allOrders() {
      const result = await client.execute("SELECT * FROM orders ORDER BY id");
      return rowsOf(result).map(toOrder);
    },
    async getOrder(id) {
      const result = await client.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [id] });
      const row = rowsOf(result)[0];
      return row ? toOrder(row) : null;
    },
    async searchOrders(customer) {
      const needle = customer.trim().toLowerCase().replace(/[%_\\]/g, "");
      if (!needle) return [];
      const result = await client.execute({
        sql: "SELECT * FROM orders WHERE instr(lower(customer), ?) > 0 ORDER BY id",
        args: [needle],
      });
      return rowsOf(result).map(toOrder);
    },
    async customerNames() {
      const result = await client.execute("SELECT DISTINCT customer FROM orders ORDER BY customer");
      return rowsOf(result).map((row) => asText(row.customer));
    },
    async insertRefund(input) {
      const createdAt = new Date().toISOString();
      try {
        await client.execute({
          sql: "INSERT INTO refunds (order_id, amount, idempotency_key, created_at) VALUES (?, ?, ?, ?)",
          args: [input.orderId, input.amount, input.idempotencyKey, createdAt],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("unique")) throw new IdempotencyConflict();
        throw error;
      }
      const result = await client.execute("SELECT * FROM refunds WHERE id = last_insert_rowid()");
      const row = rowsOf(result)[0];
      if (!row) throw new Error("Refund insert did not return a row");
      return toRefund(row);
    },
    async findRefundByKey(key) {
      const result = await client.execute({
        sql: "SELECT * FROM refunds WHERE idempotency_key = ? ORDER BY id LIMIT 1",
        args: [key],
      });
      const row = rowsOf(result)[0];
      return row ? toRefund(row) : null;
    },
    async listRefunds() {
      const result = await client.execute("SELECT * FROM refunds ORDER BY id");
      return rowsOf(result).map(toRefund);
    },
    async updateAddress(id, address) {
      await client.execute({ sql: "UPDATE orders SET address = ? WHERE id = ?", args: [address, id] });
    },
    async insertTicket(input) {
      const createdAt = new Date().toISOString();
      await client.execute({
        sql: "INSERT INTO tickets (reason, conversation, trace, created_at) VALUES (?, ?, ?, ?)",
        args: [input.reason, input.conversation, input.trace, createdAt],
      });
      const result = await client.execute("SELECT * FROM tickets WHERE id = last_insert_rowid()");
      const row = rowsOf(result)[0];
      if (!row) throw new Error("Ticket insert did not return a row");
      return toTicket(row);
    },
    async listTickets() {
      const result = await client.execute("SELECT * FROM tickets ORDER BY id");
      return rowsOf(result).map(toTicket);
    },
    async duplicateRefundOrders() {
      const result = await client.execute(
        "SELECT order_id, COUNT(*) AS count FROM refunds GROUP BY order_id HAVING COUNT(*) > 1",
      );
      return rowsOf(result).map((row) => ({
        order_id: asNumber(row.order_id),
        count: asNumber(row.count),
      }));
    },
    close() {
      client.close();
    },
  };
}

export async function snapshotDb(db: Db) {
  const [orders, refunds, tickets] = await Promise.all([db.allOrders(), db.listRefunds(), db.listTickets()]);
  return { orders, refunds, tickets };
}
