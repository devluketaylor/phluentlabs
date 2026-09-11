"use client";

/**
 * Lightweight, dependency-free, SSR-safe chart primitives for the admin
 * analytics dashboard. Rendered as inline SVG using theme tokens (via
 * `currentColor` / CSS vars) so they respect light + dark mode automatically.
 * The coral accent `#ff5c5c` is safe on both themes. No raw @radix-ui, no
 * external chart library.
 */

import * as React from "react";

const CORAL = "#ff5c5c";

type Point = { label: string; value: number };

/** A simple area/line chart for a single series (e.g. cumulative growth). */
export function LineChart({
    data,
    height = 160,
    valueSuffix = "",
    ariaLabel,
}: {
    data: Point[];
    height?: number;
    valueSuffix?: string;
    ariaLabel?: string;
}) {
    const width = 640; // viewBox width; SVG scales to container
    const padX = 8;
    const padY = 14;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    if (data.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                No data yet.
            </p>
        );
    }

    const max = Math.max(1, ...data.map((d) => d.value));
    const n = data.length;
    const stepX = n > 1 ? innerW / (n - 1) : 0;

    const points = data.map((d, i) => {
        const x = padX + (n > 1 ? i * stepX : innerW / 2);
        const y = padY + innerH - (d.value / max) * innerH;
        return { x, y, ...d };
    });

    const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(" ");
    const areaPath =
        `M${points[0].x.toFixed(1)},${(padY + innerH).toFixed(1)} ` +
        points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
        ` L${points[points.length - 1].x.toFixed(1)},${(padY + innerH).toFixed(1)} Z`;

    return (
        <div className="w-full">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                style={{ height }}
                role="img"
                aria-label={ariaLabel ?? "Line chart"}
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CORAL} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={CORAL} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#lc-fill)" />
                <path
                    d={linePath}
                    fill="none"
                    stroke={CORAL}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
                {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={CORAL}>
                        <title>
                            {p.label}: {p.value.toLocaleString()}
                            {valueSuffix}
                        </title>
                    </circle>
                ))}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{data[0]?.label}</span>
                {data.length > 2 && (
                    <span>{data[Math.floor(data.length / 2)]?.label}</span>
                )}
                <span>{data[data.length - 1]?.label}</span>
            </div>
        </div>
    );
}

/** A vertical bar chart for a single series (e.g. net-new per week). */
export function BarChart({
    data,
    height = 160,
    valueSuffix = "",
    ariaLabel,
}: {
    data: Point[];
    height?: number;
    valueSuffix?: string;
    ariaLabel?: string;
}) {
    const width = 640;
    const padX = 8;
    const padY = 14;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    if (data.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                No data yet.
            </p>
        );
    }

    const max = Math.max(1, ...data.map((d) => d.value));
    const n = data.length;
    const slot = innerW / n;
    const barW = Math.max(2, slot * 0.6);

    return (
        <div className="w-full">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                style={{ height }}
                role="img"
                aria-label={ariaLabel ?? "Bar chart"}
                preserveAspectRatio="none"
            >
                {data.map((d, i) => {
                    const h = (d.value / max) * innerH;
                    const x = padX + i * slot + (slot - barW) / 2;
                    const y = padY + innerH - h;
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={barW}
                            height={Math.max(0, h)}
                            rx={2}
                            fill={CORAL}
                            fillOpacity={0.85}
                        >
                            <title>
                                {d.label}: {d.value.toLocaleString()}
                                {valueSuffix}
                            </title>
                        </rect>
                    );
                })}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{data[0]?.label}</span>
                {data.length > 2 && (
                    <span>{data[Math.floor(data.length / 2)]?.label}</span>
                )}
                <span>{data[data.length - 1]?.label}</span>
            </div>
        </div>
    );
}

/**
 * A dual-series line chart (e.g. open rate vs click rate over issues).
 * seriesA is coral; seriesB uses the muted-foreground token.
 */
export function DualLineChart({
    labels,
    seriesA,
    seriesB,
    height = 180,
    valueSuffix = "%",
    ariaLabel,
}: {
    labels: string[];
    seriesA: { name: string; values: number[] };
    seriesB: { name: string; values: number[] };
    height?: number;
    valueSuffix?: string;
    ariaLabel?: string;
}) {
    const width = 640;
    const padX = 8;
    const padY = 14;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const n = labels.length;
    if (n === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                No data yet.
            </p>
        );
    }

    const max = Math.max(
        1,
        ...seriesA.values,
        ...seriesB.values
    );
    const stepX = n > 1 ? innerW / (n - 1) : 0;

    const toPath = (values: number[]) =>
        values
            .map((v, i) => {
                const x = padX + (n > 1 ? i * stepX : innerW / 2);
                const y = padY + innerH - (v / max) * innerH;
                return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");

    const dots = (values: number[], color: string) =>
        values.map((v, i) => {
            const x = padX + (n > 1 ? i * stepX : innerW / 2);
            const y = padY + innerH - (v / max) * innerH;
            return (
                <circle key={i} cx={x} cy={y} r={2.5} fill={color}>
                    <title>
                        {labels[i]}: {v}
                        {valueSuffix}
                    </title>
                </circle>
            );
        });

    return (
        <div className="w-full">
            <div className="mb-2 flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                    <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: CORAL }}
                    />
                    {seriesA.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
                    {seriesB.name}
                </span>
            </div>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                style={{ height }}
                role="img"
                aria-label={ariaLabel ?? "Engagement over time"}
                preserveAspectRatio="none"
            >
                <path
                    d={toPath(seriesB.values)}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted-foreground"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                />
                <path
                    d={toPath(seriesA.values)}
                    fill="none"
                    stroke={CORAL}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                />
                {dots(seriesB.values, "currentColor")}
                {dots(seriesA.values, CORAL)}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{labels[0]}</span>
                {n > 2 && <span>{labels[Math.floor(n / 2)]}</span>}
                <span>{labels[n - 1]}</span>
            </div>
        </div>
    );
}
