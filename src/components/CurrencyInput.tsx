// src/components/CurrencyInput.tsx
"use client";

import { forwardRef } from "react";

interface CurrencyInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
}

const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value = "", onChange, placeholder = "0.00", className = "", name, ...props }, ref) => {
    const formatCurrency = (inputValue: string) => {
      // Remove all non-numeric characters except decimal point
      let numericValue = inputValue.replace(/[^\d.]/g, "");
      
      // Handle empty input
      if (numericValue === "" || numericValue === ".") return "";
      
      // Handle multiple decimal points - keep only the first one
      const parts = numericValue.split(".");
      if (parts.length > 2) {
        numericValue = parts[0] + "." + parts.slice(1).join("");
      }
      
      // Limit to 2 decimal places
      if (parts.length === 2 && parts[1].length > 2) {
        numericValue = parts[0] + "." + parts[1].substring(0, 2);
      }
      
      // Convert to number and format with commas
      const num = parseFloat(numericValue);
      if (isNaN(num)) return "";
      
      // Format with commas for thousands and always show 2 decimal places
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      // Only clean input during typing, don't format yet
      let cleaned = inputValue.replace(/[^\d.]/g, "");
      
      // Handle multiple decimal points - keep only the first one
      const parts = cleaned.split(".");
      if (parts.length > 2) {
        cleaned = parts[0] + "." + parts.slice(1).join("");
      }
      
      // Limit to 2 decimal places
      if (parts.length === 2 && parts[1].length > 2) {
        cleaned = parts[0] + "." + parts[1].substring(0, 2);
      }
      
      // Pass the cleaned value without formatting
      onChange?.(cleaned);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Format only on blur
      const formatted = formatCurrency(e.target.value);
      onChange?.(formatted);
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
          $
        </span>
        <input
          ref={ref}
          type="text"
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`input pl-8 pr-12 ${className}`}
          {...props}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
          USD
        </span>
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export default CurrencyInput;
