import Link from "next/link";
import { DASHBOARD_PERIOD_OPTIONS, type DashboardPeriod } from "@/lib/utils/period";

type DashboardMetricCardProps = {
  title: string;
  value: string;
  accentClassName?: string;
  className?: string;
  titleClassName?: string;
  valueClassName?: string;
  footer?: React.ReactNode;
};

type DashboardPanelProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

type DashboardInsightsSectionProps = {
  title: string;
  insights: string[];
  columnsClassName?: string;
};

type DashboardActionCardProps = {
  title: string;
  description: string;
  href: string;
  buttonLabel?: string;
  className?: string;
};

type DashboardListRowProps = {
  left: string;
  right: string;
  leftClassName?: string;
  rightClassName?: string;
};

type DashboardPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  titleClassName?: string;
  className?: string;
};

type DashboardPeriodSelectProps = {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  className?: string;
};

export function DashboardMetricCard({
  title,
  value,
  accentClassName = "text-[#d08a35]",
  className = "",
  titleClassName = "text-sm text-zinc-400",
  valueClassName = "mt-3 text-3xl font-bold",
  footer,
}: DashboardMetricCardProps) {
  return (
    <div
      className={`rounded-3xl border border-[#d08a35]/20 bg-white/5 p-6 ${className}`.trim()}
    >
      <p className={titleClassName}>{title}</p>
      <p className={`${valueClassName} ${accentClassName}`.trim()}>{value}</p>
      {footer}
    </div>
  );
}

export function DashboardPanel({
  title,
  children,
  className = "",
  contentClassName = "mt-5",
}: DashboardPanelProps) {
  return (
    <section
      className={`rounded-[2rem] border border-[#d08a35]/20 bg-white/5 p-6 ${className}`.trim()}
    >
      <h2 className="text-2xl font-bold text-[#d08a35]">{title}</h2>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function DashboardInsightsSection({
  title,
  insights,
  columnsClassName = "md:grid-cols-2",
}: DashboardInsightsSectionProps) {
  return (
    <DashboardPanel title={title}>
      <div className={`grid gap-4 ${columnsClassName}`.trim()}>
        {insights.map((insight, index) => (
          <div
            key={`${title}-${index}`}
            className="rounded-2xl border border-white/10 bg-black/30 p-5 text-zinc-300"
          >
            {insight}
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

export function DashboardActionCard({
  title,
  description,
  href,
  buttonLabel = "Open",
  className = "",
}: DashboardActionCardProps) {
  return (
    <Link
      href={href}
      className={`group rounded-[2rem] border border-[#d08a35]/20 bg-black/30 p-6 shadow-2xl transition hover:-translate-y-1 hover:border-[#d08a35]/70 hover:bg-[#d08a35]/10 ${className}`.trim()}
    >
      <h2 className="text-2xl font-black text-[#d08a35]">{title}</h2>
      <p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">
        {description}
      </p>

      <div className="mt-6 rounded-2xl bg-[#d08a35] px-5 py-3 text-center font-bold text-black group-hover:bg-[#e9a34c]">
        {buttonLabel}
      </div>
    </Link>
  );
}

export function DashboardListRow({
  left,
  right,
  leftClassName = "text-zinc-300",
  rightClassName = "font-semibold text-[#d08a35]",
}: DashboardListRowProps) {
  return (
    <div className="flex justify-between border-b border-white/10 py-3">
      <span className={leftClassName}>{left}</span>
      <span className={rightClassName}>{right}</span>
    </div>
  );
}

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleClassName = "mt-3 text-5xl font-bold",
  className = "",
}: DashboardPageHeaderProps) {
  return (
    <div
      className={`flex flex-col justify-between gap-5 md:flex-row md:items-end ${className}`.trim()}
    >
      <div>
        {eyebrow && (
          <p className="text-sm uppercase tracking-[0.3em] text-[#d08a35]">
            {eyebrow}
          </p>
        )}

        <h1 className={titleClassName}>{title}</h1>

        <p className="mt-3 text-zinc-400">{description}</p>
      </div>

      {actions}
    </div>
  );
}

export function DashboardPeriodSelect({
  value,
  onChange,
  className = "",
}: DashboardPeriodSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as DashboardPeriod)}
      className={`rounded-2xl border border-white/10 bg-black/50 px-4 py-3 ${className}`.trim()}
    >
      {DASHBOARD_PERIOD_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
