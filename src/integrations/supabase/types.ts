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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_requests: {
        Row: {
          activity_key: string | null
          created_at: string
          description: string
          effort: string
          id: string
          kind: string
          lovable_prompt: string
          operation_id: string | null
          page: string
          priority: string
          requested_by: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_key?: string | null
          created_at?: string
          description?: string
          effort?: string
          id?: string
          kind?: string
          lovable_prompt?: string
          operation_id?: string | null
          page?: string
          priority?: string
          requested_by?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity_key?: string | null
          created_at?: string
          description?: string
          effort?: string
          id?: string
          kind?: string
          lovable_prompt?: string
          operation_id?: string | null
          page?: string
          priority?: string
          requested_by?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bulk_operation_locks: {
        Row: {
          acquired_at: string
          operation_id: string
          resource: string
        }
        Insert: {
          acquired_at?: string
          operation_id: string
          resource: string
        }
        Update: {
          acquired_at?: string
          operation_id?: string
          resource?: string
        }
        Relationships: []
      }
      bulk_operations: {
        Row: {
          actor: string
          attempts: Json
          created_at: string
          execution_token: string | null
          id: string
          input: Json
          kind: string
          outcomes: Json
          page: string
          reconciliation: Json
          status: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor: string
          attempts?: Json
          created_at?: string
          execution_token?: string | null
          id: string
          input?: Json
          kind: string
          outcomes?: Json
          page?: string
          reconciliation?: Json
          status?: string
          summary?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor?: string
          attempts?: Json
          created_at?: string
          execution_token?: string | null
          id?: string
          input?: Json
          kind?: string
          outcomes?: Json
          page?: string
          reconciliation?: Json
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dashboard_charts: {
        Row: {
          created_at: string
          created_by: string
          dashboard: string
          id: string
          prompt: string
          spec: Json
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          dashboard: string
          id?: string
          prompt?: string
          spec?: Json
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dashboard?: string
          id?: string
          prompt?: string
          spec?: Json
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      morning_briefs: {
        Row: {
          brief: Json
          brief_date: string
          cowork_text: string
          created_at: string
          email_error: string
          email_status: string
          error: string
          id: string
          owner_email: string
          source_message_id: string
          status: string
          updated_at: string
        }
        Insert: {
          brief?: Json
          brief_date: string
          cowork_text?: string
          created_at?: string
          email_error?: string
          email_status?: string
          error?: string
          id?: string
          owner_email: string
          source_message_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          brief?: Json
          brief_date?: string
          cowork_text?: string
          created_at?: string
          email_error?: string
          email_status?: string
          error?: string
          id?: string
          owner_email?: string
          source_message_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      personal_granola_connections: {
        Row: {
          connected_at: string
          key_ciphertext: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          key_ciphertext: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          key_ciphertext?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sheet_mirror_rows: {
        Row: {
          cells: Json
          row_no: number
          spreadsheet_id: string
          tab: string
        }
        Insert: {
          cells?: Json
          row_no: number
          spreadsheet_id: string
          tab: string
        }
        Update: {
          cells?: Json
          row_no?: number
          spreadsheet_id?: string
          tab?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_mirror_rows_spreadsheet_id_tab_fkey"
            columns: ["spreadsheet_id", "tab"]
            isOneToOne: false
            referencedRelation: "sheet_mirror_tabs"
            referencedColumns: ["spreadsheet_id", "tab"]
          },
        ]
      }
      sheet_mirror_state: {
        Row: {
          checked_at: string | null
          drive_modified_at: string
          last_error: string
          last_result: Json
          spreadsheet_id: string
          synced_at: string | null
        }
        Insert: {
          checked_at?: string | null
          drive_modified_at?: string
          last_error?: string
          last_result?: Json
          spreadsheet_id: string
          synced_at?: string | null
        }
        Update: {
          checked_at?: string | null
          drive_modified_at?: string
          last_error?: string
          last_result?: Json
          spreadsheet_id?: string
          synced_at?: string | null
        }
        Relationships: []
      }
      sheet_mirror_tabs: {
        Row: {
          content_hash: string
          created_at: string
          dirty: boolean
          patched_at: string | null
          row_count: number
          snapshot: Json | null
          spreadsheet_id: string
          stale: boolean
          synced_at: string | null
          tab: string
        }
        Insert: {
          content_hash?: string
          created_at?: string
          dirty?: boolean
          patched_at?: string | null
          row_count?: number
          snapshot?: Json | null
          spreadsheet_id: string
          stale?: boolean
          synced_at?: string | null
          tab: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          dirty?: boolean
          patched_at?: string | null
          row_count?: number
          snapshot?: Json | null
          spreadsheet_id?: string
          stale?: boolean
          synced_at?: string | null
          tab?: string
        }
        Relationships: []
      }
      vic_messages: {
        Row: {
          created_at: string
          id: string
          message: Json
          message_id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: Json
          message_id: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: Json
          message_id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vic_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vic_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      vic_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vic_whatsapp_links: {
        Row: {
          created_at: string
          last_message_at: string | null
          phone_e164: string
          team_email: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_message_at?: string | null
          phone_e164: string
          team_email: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_message_at?: string | null
          phone_e164?: string
          team_email?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vic_whatsapp_links_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vic_threads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_bulk_attempt: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      checkpoint_bulk_attempt: {
        Args: { p_id: string; p_outcomes: Json; p_token: string }
        Returns: boolean
      }
      claim_bulk_operation_lock: {
        Args: { p_operation_id: string; p_resource: string }
        Returns: boolean
      }
      finish_bulk_attempt: {
        Args: {
          p_attempt: Json
          p_id: string
          p_outcomes: Json
          p_status: string
          p_summary: string
          p_token: string
        }
        Returns: boolean
      }
      is_team_member: { Args: never; Returns: boolean }
      mirror_append_rows: {
        Args: {
          p_rows: Json
          p_sheet: string
          p_start_row: number
          p_tab: string
        }
        Returns: boolean
      }
      mirror_confirm_current: {
        Args: { p_checked_at: string; p_sheet: string }
        Returns: number
      }
      mirror_mark_stale: {
        Args: { p_sheet: string; p_tab: string }
        Returns: undefined
      }
      mirror_patch_cells: {
        Args: { p_cells: Json; p_sheet: string; p_tab: string }
        Returns: boolean
      }
      mirror_put_rows: {
        Args: {
          p_col: number
          p_rows: Json
          p_sheet: string
          p_start_row: number
          p_tab: string
        }
        Returns: boolean
      }
      mirror_read_tab: {
        Args: { p_sheet: string; p_tab: string }
        Returns: Json
      }
      mirror_replace_tab: {
        Args: {
          p_hash: string
          p_rows: Json
          p_sheet: string
          p_started_at: string
          p_tab: string
        }
        Returns: string
      }
      mirror_splice: {
        Args: { p_col: number; p_old: Json; p_vals: Json }
        Returns: Json
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
