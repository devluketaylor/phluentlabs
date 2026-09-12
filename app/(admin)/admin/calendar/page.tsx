"use client";

import { FormHeader } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import { CalendarDays, ChevronLeft, ChevronRight, Send, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(ms: number) {
    return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function CalendarPage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    // 1-indexed month
    const [month, setMonth] = useState(now.getMonth() + 1);

    const { data, isLoading, isError, error, isFetching } =
        trpc.adminDashboard.calendar.useQuery(
            { year, month },
            { refetchOnWindowFocus: false }
        );

    function prevMonth() {
        if (month === 1) {
            setYear((y) => y - 1);
            setMonth(12);
        } else {
            setMonth((m) => m - 1);
        }
    }
    function nextMonth() {
        if (month === 12) {
            setYear((y) => y + 1);
            setMonth(1);
        } else {
            setMonth((m) => m + 1);
        }
    }
    function goToday() {
        setYear(now.getFullYear());
        setMonth(now.getMonth() + 1);
    }

    // Group items by day-of-month for the grid.
    const byDay = new Map<number, NonNullable<typeof data>["items"]>();
    if (data) {
        for (const item of data.items) {
            const arr = byDay.get(item.day) ?? [];
            arr.push(item);
            byDay.set(item.day, arr);
        }
    }

    const daysInMonth = data?.daysInMonth ?? 0;
    const firstWeekday = data?.firstWeekday ?? 0;
    // Total cells = leading blanks + days, rounded up to full weeks.
    const totalCells = data
        ? Math.ceil((firstWeekday + daysInMonth) / 7) * 7
        : 0;

    const isCurrentMonth =
        year === now.getFullYear() && month === now.getMonth() + 1;
    const todayDate = now.getDate();

    return (
        <div className="max-w-5xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<CalendarDays />}
                    title="Calendar"
                    description="Scheduled and sent issues at a glance."
                />
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button variant="secondary" size="icon" onClick={prevMonth} aria-label="Previous month">
                        <ChevronLeft />
                    </Button>
                    <div className="min-w-[9rem] text-center text-sm font-medium">
                        {MONTH_NAMES[month - 1]} {year}
                    </div>
                    <Button variant="secondary" size="icon" onClick={nextMonth} aria-label="Next month">
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" onClick={goToday} disabled={isCurrentMonth}>
                        Today
                    </Button>
                </div>
            </div>

            {isError && (
                <Card>
                    <CardContent className="text-sm text-destructive">
                        Failed to load calendar: {error?.message ?? "Unknown error"}
                    </CardContent>
                </Card>
            )}

            {/* Upcoming scheduled queue */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock className="size-4" /> Upcoming scheduled
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-2/3" />
                        </div>
                    ) : data && data.upcoming.length > 0 ? (
                        <ul className="divide-y">
                            {data.upcoming.map((u) => (
                                <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                    <Link
                                        href={`/admin/newsletters/${u.id}`}
                                        className="truncate font-medium hover:text-[#ff5c5c]"
                                    >
                                        {u.subject}
                                    </Link>
                                    <span className="shrink-0 text-muted-foreground">
                                        {formatTime(u.dateMs)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No upcoming scheduled issues.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Month grid */}
            <Card>
                <CardContent className="p-3 sm:p-4">
                    {/* Weekday header */}
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 pb-2 text-center text-xs font-medium text-muted-foreground">
                        {WEEKDAYS.map((d) => (
                            <div key={d}>{d}</div>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-7 gap-1 sm:gap-2">
                            {Array.from({ length: 35 }).map((_, i) => (
                                <Skeleton key={i} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-1 sm:gap-2">
                            {Array.from({ length: totalCells }).map((_, cell) => {
                                const dayNum = cell - firstWeekday + 1;
                                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                                if (!inMonth) {
                                    return (
                                        <div
                                            key={cell}
                                            className="min-h-20 rounded-md bg-muted/30"
                                        />
                                    );
                                }
                                const dayItems = byDay.get(dayNum) ?? [];
                                const isToday = isCurrentMonth && dayNum === todayDate;
                                return (
                                    <div
                                        key={cell}
                                        className={`min-h-20 rounded-md border p-1.5 ${
                                            isToday
                                                ? "border-[#ff5c5c] ring-1 ring-[#ff5c5c]/40"
                                                : "border-border"
                                        }`}
                                    >
                                        <div
                                            className={`mb-1 text-xs font-medium ${
                                                isToday ? "text-[#ff5c5c]" : "text-muted-foreground"
                                            }`}
                                        >
                                            {dayNum}
                                        </div>
                                        <div className="space-y-1">
                                            {dayItems.map((item) => {
                                                const sent = item.status === "sent";
                                                return (
                                                    <Link
                                                        key={item.id}
                                                        href={`/admin/newsletters/${item.id}`}
                                                        title={`${item.subject} — ${sent ? "sent" : "scheduled"}`}
                                                        className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight ${
                                                            sent
                                                                ? "bg-muted text-foreground/80"
                                                                : "bg-[#ff5c5c]/15 text-[#ff5c5c]"
                                                        } hover:opacity-80`}
                                                    >
                                                        {sent ? (
                                                            <Send className="size-3 shrink-0" />
                                                        ) : (
                                                            <Clock className="size-3 shrink-0" />
                                                        )}
                                                        <span className="truncate">{item.subject}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Legend */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Clock className="size-3 text-[#ff5c5c]" /> Scheduled
                        </span>
                        <span className="flex items-center gap-1">
                            <Send className="size-3" /> Sent
                        </span>
                        {isFetching && !isLoading && <span>Refreshing…</span>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
