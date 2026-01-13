import { supabase } from './supabase';

export type NotificationType = 'info' | 'alert' | 'success' | 'warning';

export const Notifications = {
  /**
   * Sends a notification to a specific user.
   * Currently persists to Supabase. Future: Trigger Push/SMS/Email here.
   */
  async send(userId: string, title: string, body: string, type: NotificationType = 'info', metadata: any = {}) {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          title,
          body,
          type,
          metadata
        }]);
      
      if (error) throw error;
      
      // Placeholder: In the future, we would call an Edge Function here
      // await fetch('https://.../send-push', { ... })
      
    } catch (e) {
      console.error('Failed to send notification:', e);
    }
  },

  /**
   * Marks a notification as read
   */
  async markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  },

  /**
   * Marks all notifications for a user as read
   */
  async markAllAsRead(userId: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  }
};
