import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-center max-w-md">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {description}
        </p>
        {cta && (
          <Button
            onClick={cta.onClick}
            size="sm"
            data-testid={`button-${cta.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Plus className="mr-2" size={14} />
            {cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}
