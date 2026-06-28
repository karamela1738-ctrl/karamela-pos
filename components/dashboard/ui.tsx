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

type DashboardReportDateBannerProps = {
  label?: string;
  value: string;
  className?: string;
};

export function DashboardMetricCard({
  title,
  value,
  accentClassName = "text-[#d08a35]",
  className = "",
  titleClassName = "text-xs uppercase tracking-[0.18em] text-zinc-400 sm:text-sm sm:tracking-[0.24em]",
  valueClassName = "mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl",
  footer,
}: DashboardMetricCardProps) {
  return (
    <div
      className={`rounded-[1.5rem] border border-[#d08a35]/20 bg-white/5 p-5 sm:rounded-3xl sm:p-6 ${className}`.trim()}
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
      className={`rounded-[1.5rem] border border-[#d08a35]/20 bg-white/5 p-5 sm:rounded-[2rem] sm:p-6 ${className}`.trim()}
    >
      <h2 className="text-xl font-bold text-[#d08a35] sm:text-2xl">{title}</h2>
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
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-300 sm:p-5"
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
      className={`group rounded-[1.5rem] border border-[#d08a35]/20 bg-black/30 p-5 shadow-2xl transition hover:-translate-y-1 hover:border-[#d08a35]/70 hover:bg-[#d08a35]/10 sm:rounded-[2rem] sm:p-6 ${className}`.trim()}
    >
      <h2 className="text-xl font-black text-[#d08a35] sm:text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-400 sm:min-h-16">
        {description}
      </p>

      <div className="mt-5 rounded-2xl bg-[#d08a35] px-5 py-3.5 text-center font-bold text-black group-hover:bg-[#e9a34c] sm:mt-6">
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
    <div className="flex flex-col gap-1 border-b border-white/10 py-3 sm:flex-row sm:items-center sm:justify-between">
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
  titleClassName = "mt-2 text-3xl font-bold sm:mt-3 sm:text-4xl lg:text-5xl",
  className = "",
}: DashboardPageHeaderProps) {
  return (
    <div
      className={`flex flex-col justify-between gap-4 lg:flex-row lg:items-end ${className}`.trim()}
    >
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.24em] text-[#d08a35] sm:text-sm sm:tracking-[0.3em]">
            {eyebrow}
          </p>
        )}

        <h1 className={titleClassName}>{title}</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
          {description}
        </p>
      </div>

      {actions && <div className="w-full lg:w-auto lg:flex-shrink-0">{actions}</div>}
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
      className={`min-h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 sm:w-auto ${className}`.trim()}
    >
      {DASHBOARD_PERIOD_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function DashboardReportDateBanner({
  label = "Reporting Period",
  value,
  className = "",
}: DashboardReportDateBannerProps) {
  return (
    <div
      className={`mt-4 rounded-2xl border border-[#d08a35]/20 bg-black/30 px-4 py-3 text-sm text-zinc-300 sm:mt-5 sm:px-5 ${className}`.trim()}
    >
      <span className="font-semibold uppercase tracking-[0.2em] text-[#d08a35]">
        {label}
      </span>
      <span className="ml-3 text-zinc-200">{value}</span>
    </div>
  );
}
