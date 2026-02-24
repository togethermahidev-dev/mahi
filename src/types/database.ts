// Auto-generated types from Supabase schema
// Run: npx supabase gen types typescript --project-id pzepodsppqtvptzmwxzs > src/types/database.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id:              string;
          username:        string;
          display_name:    string | null;
          first_name:      string | null;
          last_name:       string | null;
          date_of_birth:   string | null;  // ISO date 'YYYY-MM-DD'
          contact_number:  string | null;
          fitness_goals:   string[] | null;
          fitness_routine: string | null;
          avatar_url:      string | null;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id:              string;
          username:        string;
          display_name?:   string | null;
          first_name?:     string | null;
          last_name?:      string | null;
          date_of_birth?:  string | null;
          contact_number?: string | null;
          fitness_goals?:  string[] | null;
          fitness_routine?: string | null;
          avatar_url?:     string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['profiles']['Insert'], 'id'>>;
      };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums:     Record<string, never>;
  };
};
