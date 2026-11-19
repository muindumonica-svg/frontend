import { Link, createFileRoute } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { usePublicFaq } from "@/api/hooks/public";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_public/faq")({
  component: FaqPage,
});

function FaqPage() {
  const faq = usePublicFaq();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Ordering questions"
        subtitle="How online ordering, payment, stock holds and delivery work at BrathaMatu."
      />

      {faq.isPending && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {faq.isError && (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          The questions did not load. You can still{" "}
          <Link to="/shop" className="underline">browse the shop</Link> or{" "}
          <Link to="/locations" className="underline">check delivery areas</Link>.
        </p>
      )}

      {faq.isSuccess && (
        <div className="mt-6 space-y-3">
          {faq.data.items.map((item) => (
            <section key={item.question} className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="flex items-start gap-2 font-display text-sm font-bold">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
                {item.question}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </section>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/shop">Browse today&apos;s stock</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/locations">Delivery areas</Link>
        </Button>
      </div>
    </div>
  );
}
