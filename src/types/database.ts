// Auto-generated types from Supabase schema
// Run: npx supabase gen types typescript --project-id pzepodsppqtvptzmwxzs > src/types/database.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id:                      string;
          username:                string;
          display_name:            string | null;
          first_name:              string | null;
          last_name:               string | null;
          date_of_birth:           string | null;  // ISO date 'YYYY-MM-DD'
          contact_number:          string | null;
          fitness_goals:           string[] | null;
          fitness_routine:         string | null;
          avatar_url:              string | null;
          streak_current:          number;
          streak_highest:          number;
          streak_lowest:           number | null;
          streak_last_upload_date: string | null;  // ISO date 'YYYY-MM-DD'
          created_at:              string;
          updated_at:              string;
        };
        Insert: {
          id:                       string;
          username:                 string;
          display_name?:            string | null;
          first_name?:              string | null;
          last_name?:               string | null;
          date_of_birth?:           string | null;
          contact_number?:          string | null;
          fitness_goals?:           string[] | null;
          fitness_routine?:         string | null;
          avatar_url?:              string | null;
          streak_current?:          number;
          streak_highest?:          number;
          streak_lowest?:           number | null;
          streak_last_upload_date?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['profiles']['Insert'], 'id'>>;
      };
      streak_logs: {
        Row: {
          id:           string;
          user_id:      string;
          streak_count: number;
          started_at:   string;  // ISO date 'YYYY-MM-DD'
          ended_at:     string | null;  // null = still active
          is_active:    boolean;
          created_at:   string;
        };
        Insert: {
          id?:          string;
          user_id:      string;
          streak_count: number;
          started_at:   string;
          ended_at?:    string | null;
          is_active?:   boolean;
        };
        Update: Partial<Omit<Database['public']['Tables']['streak_logs']['Insert'], 'id' | 'user_id'>>;
      };
      posts: {
        Row: {
          id:            string;
          user_id:       string;
          image_url:     string;       // rear / POV photo (default full-screen)
          pov_image_url: string | null; // front selfie pip (null for legacy single-photo posts)
          caption:       string | null;
          streak_day:    number;
          created_at:    string;
        };
        Insert: {
          id?:            string;
          user_id:        string;
          image_url:      string;
          pov_image_url?: string | null;
          caption?:       string | null;
          streak_day:     number;
        };
        Update: {
          caption?: string | null;
        };
      };
      conversations: {
        Row: {
          id:              string;
          participant_one: string;
          participant_two: string;
          status:          'requested' | 'active';
          initiated_by:    string;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:             string;
          participant_one: string;
          participant_two: string;
          status?:         'requested' | 'active';
          initiated_by:    string;
        };
        Update: {
          status?: 'requested' | 'active';
        };
      };
      messages: {
        Row: {
          id:              string;
          conversation_id: string;
          sender_id:       string;
          content:         string;
          created_at:      string;
        };
        Insert: {
          id?:             string;
          conversation_id: string;
          sender_id:       string;
          content:         string;
        };
        Update: Record<string, never>;
      };
    };
    Views:     Record<string, never>;
    Functions: {
      record_upload_streak: {
        Args: { p_user_id: string; p_upload_date?: string };
        Returns: {
          streak_current: number;
          streak_highest: number;
          streak_lowest:  number | null;
          action: 'extended' | 'reset' | 'already_uploaded_today';
        };
      };
    };
    Enums:     Record<string, never>;
  };
};
