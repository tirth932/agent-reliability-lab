"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CompareChart({
  title,
  data,
  beforeLabel = "Before",
  afterLabel = "After",
}: {
  title: string;
  data: { name: string; before: number; after: number }[];
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="before" name={beforeLabel} fill="#a1a1aa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="after" name={afterLabel} fill="#0f766e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
