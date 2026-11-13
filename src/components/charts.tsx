"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CompareChart({
  title,
  data,
}: {
  title: string;
  data: { name: string; before: number; after: number }[];
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
            <Bar dataKey="before" fill="#71717a" />
            <Bar dataKey="after" fill="#18181b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
