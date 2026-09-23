// Auto-generated types from Supabase schema
// Run: npx supabase gen types typescript --project-id pzepodsppqtvptzmwxzs > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      app_config: {
        Row: {
          feed_lock_enabled: boolean;
          id: boolean;
          min_app_version: string;
          quiet_end: string;
          quiet_start: string;
          storage_public_url: string;
          tag_count: number;
          tag_window: string;
          answer_grace: string;
          tags_required: boolean;
          unlock_window: string;
          invite_ttl: string;
          invite_base_url: string;
          invite_links_enabled: boolean;
          nudge_days: number;
          gate_enabled: boolean;
          min_version_ios: string;
          min_version_android: string;
          min_build_ios: number | null;
          min_build_android: number | null;
          store_url_ios: string | null;
          store_url_android: string | null;
          gate_message: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conversation_reads: {
        Row: {
          conversation_id: string;
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_reads_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_reads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          initiated_by: string;
          participant_one: string;
          participant_two: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          initiated_by: string;
          participant_one: string;
          participant_two: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          initiated_by?: string;
          participant_one?: string;
          participant_two?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_participant_one_fkey';
            columns: ['participant_one'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_participant_two_fkey';
            columns: ['participant_two'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          client_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          client_id?: string | null;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          client_id?: string | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string;
          comment_id: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          post_id: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          actor_id: string;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          post_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          actor_id?: string;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          post_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'post_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      // NOTE: hand-added pending a real `supabase gen types` regen — see migrations
      // for otp_codes / user_blocks / user_reports tables + profiles.is_banned.
      otp_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          created_at: string;
          email: string;
          expires_at: string;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          created_at?: string;
          email: string;
          expires_at: string;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      post_comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_likes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_tags: {
        Row: {
          post_id: string;
          user_id: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
        };
        Update: {
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_tags_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_tags_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          caption: string | null;
          client_id: string | null;
          created_at: string;
          id: string;
          image_path: string | null;
          image_url: string;
          latitude: number | null;
          longitude: number | null;
          post_date: string;
          pov_image_path: string | null;
          pov_image_url: string | null;
          streak_day: number;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          image_url: string;
          latitude?: number | null;
          longitude?: number | null;
          post_date?: string;
          pov_image_path?: string | null;
          pov_image_url?: string | null;
          streak_day: number;
          user_id: string;
        };
        Update: {
          caption?: string | null;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          image_url?: string;
          latitude?: number | null;
          longitude?: number | null;
          post_date?: string;
          pov_image_path?: string | null;
          pov_image_url?: string | null;
          streak_day?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          contact_number: string | null;
          created_at: string;
          date_of_birth: string | null;
          display_name: string | null;
          first_name: string | null;
          fitness_goals: string[] | null;
          fitness_routine: string | null;
          id: string;
          is_banned: boolean;
          last_name: string | null;
          streak_current: number;
          streak_highest: number;
          streak_last_upload_date: string | null;
          streak_lowest: number | null;
          timezone: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          contact_number?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          display_name?: string | null;
          first_name?: string | null;
          fitness_goals?: string[] | null;
          fitness_routine?: string | null;
          id: string;
          is_banned?: boolean;
          last_name?: string | null;
          streak_current?: number;
          streak_highest?: number;
          streak_last_upload_date?: string | null;
          streak_lowest?: number | null;
          timezone?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          contact_number?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          display_name?: string | null;
          first_name?: string | null;
          fitness_goals?: string[] | null;
          fitness_routine?: string | null;
          id?: string;
          is_banned?: boolean;
          last_name?: string | null;
          streak_current?: number;
          streak_highest?: number;
          streak_last_upload_date?: string | null;
          streak_lowest?: number | null;
          timezone?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      streak_logs: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          is_active: boolean;
          started_at: string;
          streak_count: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          is_active?: boolean;
          started_at: string;
          streak_count?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          is_active?: boolean;
          started_at?: string;
          streak_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'streak_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      // NOTE: hand-added pending a real `supabase gen types` regen.
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      // NOTE: hand-added pending a real `supabase gen types` regen.
      user_reports: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          reason: string;
          reported_post_id: string | null;
          reported_user_id: string | null;
          reporter_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          reason: string;
          reported_post_id?: string | null;
          reported_user_id?: string | null;
          reporter_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          reason?: string;
          reported_post_id?: string | null;
          reported_user_id?: string | null;
          reporter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_reports_reported_post_id_fkey';
            columns: ['reported_post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_feed_posts: {
        Args: { p_cursor_id?: string; p_cursor_ts?: string; p_limit: number };
        Returns: {
          avatar_url: string;
          caption: string;
          comment_count: number;
          created_at: string;
          display_name: string;
          id: string;
          image_url: string;
          like_count: number;
          liked_by_me: boolean;
          pov_image_url: string;
          profile_id: string;
          streak_day: number;
          tagged_users: Json;
          user_id: string;
          username: string;
        }[];
      };
      get_follow_data: {
        Args: { p_current_user_id: string; p_target_user_id: string };
        Returns: {
          follower_count: number;
          following_count: number;
          is_following: boolean;
        }[];
      };
      get_suggested_follows: {
        Args: { p_current_user_id: string; p_limit?: number; p_offset?: number };
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          mutual_count: number;
          username: string;
        }[];
      };
      create_post: {
        Args: {
          p_caption?: string | null;
          p_client_id: string;
          p_image_path: string;
          p_invite_count?: number;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_pov_image_path?: string | null;
          p_tagged_ids?: string[];
        };
        Returns: Json;
      };
      claim_invite: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_invite_preview: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_open_tags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_url: string | null;
          challenge_id: string;
          created_at: string;
          display_name: string | null;
          expires_at: string;
          server_now: string;
          tagger_id: string;
          username: string;
        }[];
      };
      get_feed: {
        Args: { p_cursor_id?: string | null; p_cursor_ts?: string | null; p_limit?: number };
        Returns: Json;
      };
      get_user_posts: {
        Args: {
          p_cursor_id?: string | null;
          p_cursor_ts?: string | null;
          p_limit?: number;
          p_user: string;
        };
        Returns: Json;
      };
      get_taggable_friends: {
        Args: { p_limit?: number; p_query?: string };
        Returns: {
          avatar_url: string | null;
          display_name: string | null;
          has_open_tag: boolean;
          id: string;
          last_tagged_at: string | null;
          points: number;
          username: string;
        }[];
      };
      get_app_gate: {
        Args: { p_platform: string };
        Returns: Json;
      };
      get_friends: {
        Args: { p_limit?: number; p_offset?: number; p_user: string };
        Returns: {
          avatar_url: string | null;
          display_name: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          username: string;
        }[];
      };
      send_message: {
        Args: { p_client_id: string; p_content: string; p_conversation_id: string };
        Returns: Json;
      };
      get_messages: {
        Args: {
          p_before?: string | null;
          p_before_id?: string | null;
          p_conversation_id: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      get_inbox: {
        Args: { p_status?: string };
        Returns: {
          id: string;
          status: string;
          initiated_by: string;
          is_requester: boolean;
          updated_at: string;
          other_id: string;
          other_username: string;
          other_display_name: string | null;
          other_avatar_url: string | null;
          last_message_id: string | null;
          last_message: string | null;
          last_message_sender: string | null;
          last_message_at: string | null;
          unread_count: number;
        }[];
      };
      register_push_token: {
        Args: { p_platform: string; p_token: string };
        Returns: undefined;
      };
      unregister_push_token: {
        Args: { p_token: string };
        Returns: undefined;
      };
      record_upload_streak: {
        Args: { p_upload_date?: string; p_user_id: string };
        Returns: Json;
      };
      toggle_like: {
        Args: { p_post_id: string; p_user_id: string };
        Returns: {
          like_count: number;
          liked: boolean;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
