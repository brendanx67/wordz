export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          api_key?: string
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_channel_members: {
        Row: {
          channel_id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          name: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          name: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          visibility?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          channel_id: string
          created_at: string
          during_game_id: string | null
          id: string
          posted_by_agent: string | null
          posted_by_user_id: string
          references_commit: string | null
          references_issue: number | null
          references_message_id: string | null
        }
        Insert: {
          body: string
          channel_id: string
          created_at?: string
          during_game_id?: string | null
          id?: string
          posted_by_agent?: string | null
          posted_by_user_id: string
          references_commit?: string | null
          references_issue?: number | null
          references_message_id?: string | null
        }
        Update: {
          body?: string
          channel_id?: string
          created_at?: string
          during_game_id?: string | null
          id?: string
          posted_by_agent?: string | null
          posted_by_user_id?: string
          references_commit?: string | null
          references_issue?: number | null
          references_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_during_game_id_fkey"
            columns: ["during_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_references_message_id_fkey"
            columns: ["references_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          created_at: string | null
          game_id: string
          id: string
          move_type: string
          player_id: string
          score: number
          tiles_placed: Json | null
          words_formed: Json | null
        }
        Insert: {
          created_at?: string | null
          game_id: string
          id?: string
          move_type: string
          player_id: string
          score?: number
          tiles_placed?: Json | null
          words_formed?: Json | null
        }
        Update: {
          created_at?: string | null
          game_id?: string
          id?: string
          move_type?: string
          player_id?: string
          score?: number
          tiles_placed?: Json | null
          words_formed?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_moves_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          find_words_enabled: boolean
          game_id: string
          id: string
          joined_at: string | null
          player_id: string
          rack: Json
          score: number
        }
        Insert: {
          find_words_enabled?: boolean
          game_id: string
          id?: string
          joined_at?: string | null
          player_id: string
          rack?: Json
          score?: number
        }
        Update: {
          find_words_enabled?: boolean
          game_id?: string
          id?: string
          joined_at?: string | null
          player_id?: string
          rack?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          board: Json
          computer_delay: number
          computer_difficulty: string | null
          computer_players: Json
          computer_rack: Json
          computer_score: number
          consecutive_passes: number
          created_at: string | null
          created_by: string
          current_turn: string | null
          has_computer: boolean
          id: string
          last_move: Json | null
          move_history: Json
          pending_human_find_words: boolean[]
          previewed_move: Json | null
          status: string
          suggested_move: Json | null
          tile_bag: Json
          turn_index: number
          turn_order: string[]
          updated_at: string | null
          winner: string | null
        }
        Insert: {
          board?: Json
          computer_delay?: number
          computer_difficulty?: string | null
          computer_players?: Json
          computer_rack?: Json
          computer_score?: number
          consecutive_passes?: number
          created_at?: string | null
          created_by: string
          current_turn?: string | null
          has_computer?: boolean
          id?: string
          last_move?: Json | null
          move_history?: Json
          pending_human_find_words?: boolean[]
          previewed_move?: Json | null
          status?: string
          suggested_move?: Json | null
          tile_bag?: Json
          turn_index?: number
          turn_order?: string[]
          updated_at?: string | null
          winner?: string | null
        }
        Update: {
          board?: Json
          computer_delay?: number
          computer_difficulty?: string | null
          computer_players?: Json
          computer_rack?: Json
          computer_score?: number
          consecutive_passes?: number
          created_at?: string | null
          created_by?: string
          current_turn?: string | null
          has_computer?: boolean
          id?: string
          last_move?: Json | null
          move_history?: Json
          pending_human_find_words?: boolean[]
          previewed_move?: Json | null
          status?: string
          suggested_move?: Json | null
          tile_bag?: Json
          turn_index?: number
          turn_order?: string[]
          updated_at?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      game_players_safe: {
        Row: {
          find_words_enabled: boolean | null
          game_id: string | null
          joined_at: string | null
          player_id: string | null
          rack: Json | null
          score: number | null
        }
        Insert: {
          find_words_enabled?: boolean | null
          game_id?: string | null
          joined_at?: string | null
          player_id?: string | null
          rack?: never
          score?: number | null
        }
        Update: {
          find_words_enabled?: boolean | null
          game_id?: string | null
          joined_at?: string | null
          player_id?: string | null
          rack?: never
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      chat_message_counts: {
        Args: { channel_ids: string[] }
        Returns: {
          channel_id: string
          cnt: number
        }[]
      }
      find_shared_active_game: {
        Args: { user_a: string; user_b: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
