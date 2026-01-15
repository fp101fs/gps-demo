import { View, ViewProps, Text, TextProps } from 'react-native';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('p-6 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return (
    <Text className={cn('text-2xl font-semibold leading-none tracking-tight text-gray-900', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('p-6 pt-0', className)} {...props} />;
}
