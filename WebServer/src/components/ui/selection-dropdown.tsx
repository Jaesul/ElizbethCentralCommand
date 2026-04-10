"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export interface SelectionDropdownOption {
  value: string;
  label: string;
}

interface SelectionDropdownProps {
  value: string;
  placeholder: string;
  options: SelectionDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

export function SelectionDropdown({
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  emptyMessage = "No options available",
}: SelectionDropdownProps) {
  const activeLabel =
    options.find((option) => option.value === value)?.label ?? placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-between px-3 py-2 font-normal ${
            !value ? "text-muted-foreground" : "text-foreground"
          } ${
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "cursor-pointer"
          }`}
          title={disabled ? placeholder : undefined}
        >
          <span className="truncate">{activeLabel}</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
      >
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{emptyMessage}</DropdownMenuItem>
        ) : (
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
