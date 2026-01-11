import { Text, TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'flex-row items-center justify-center rounded-xl px-4 py-3 active:opacity-80',
  {
    variants: {
      variant: {
        default: 'bg-blue-600',
        destructive: 'bg-red-500',
        outline: 'border border-gray-200 bg-white',
        secondary: 'bg-gray-100',
        ghost: 'bg-transparent',
      },
      size: {
        default: 'h-12',
        sm: 'h-9 px-3',
        lg: 'h-14 px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

interface ButtonProps
  extends TouchableOpacityProps,
    VariantProps<typeof buttonVariants> {
  label?: string;
}

export function Button({ className, variant, size, label, children, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {label ? (
        <Text
          className={cn(
            'text-base font-semibold',
            variant === 'outline' || variant === 'secondary' || variant === 'ghost'
              ? 'text-gray-900'
              : 'text-white'
          )}
        >
          {label}
        </Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
