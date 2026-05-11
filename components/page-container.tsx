import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
};

export function PageContainer({
  as: Component = "div",
  children,
  className,
  ...props
}: PageContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-5 xl:px-6",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
