export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      complete_public_submission: { Args: { p_id: string; p_kind: string; p_fields: Json; p_photos: Json }; Returns: string }
      listing_photo_count: { Args: { "": Database["public"]["Tables"]["listings"]["Row"] }; Returns: number }
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      listing_photos: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          listing_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          listing_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          listing_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          archived_at: string | null
          attributes: Json | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          created_at: string
          created_by_source: string
          description: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          store_id: string | null
          title: string
          updated_at: string
          view_count: number | null
          whatsapp_phone: string
        }
        Insert: {
          archived_at?: string | null
          attributes?: Json | null
          brand?: string | null
          category: string
          city: string
          condition?: string | null
          contact_name?: string | null
          created_at?: string
          created_by_source?: string
          description?: string | null
          id?: string
          instrument_type?: string | null
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          store_id?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
          whatsapp_phone: string
        }
        Update: {
          archived_at?: string | null
          attributes?: Json | null
          brand?: string | null
          category?: string
          city?: string
          condition?: string | null
          contact_name?: string | null
          created_at?: string
          created_by_source?: string
          description?: string | null
          id?: string
          instrument_type?: string | null
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          seller_type?: Database["public"]["Enums"]["seller_type"]
          slug?: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          store_id?: string | null
          title?: string
          updated_at?: string
          view_count?: number | null
          whatsapp_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          region: string
          updated_at: string
        }
        Insert: {
          account_type?: string
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          region?: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_members: {
        Row: {
          created_at: string
          id: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          banner_url: string | null
          city: string
          contact_name: string | null
          contact_person: string | null
          created_at: string
          description: string | null
          district: string | null
          email: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_verified: boolean
          listing_plan: Database["public"]["Enums"]["store_listing_plan"]
          logo_url: string | null
          name: string
          owner_user_id: string | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          website_url: string | null
          whatsapp_phone: string
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          city: string
          contact_name?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          listing_plan?: Database["public"]["Enums"]["store_listing_plan"]
          logo_url?: string | null
          name: string
          owner_user_id?: string | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_phone: string
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          city?: string
          contact_name?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          listing_plan?: Database["public"]["Enums"]["store_listing_plan"]
          logo_url?: string | null
          name?: string
          owner_user_id?: string | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      complete_public_submission: { Args: { p_id: string; p_kind: string; p_fields: Json; p_photos: Json }; Returns: string }
      listing_photo_count: { Args: { "": Database["public"]["Tables"]["listings"]["Row"] }; Returns: number }
      can_manage_listing: { Args: { p_listing_id: string }; Returns: boolean }
      increment_listing_view_count: {
        Args: { p_listing_id: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved_store_member: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      is_store_member: { Args: { p_store_id: string }; Returns: boolean }
      is_store_owner: { Args: { p_store_id: string }; Returns: boolean }
      listing_has_status: {
        Args: {
          expected_status: Database["public"]["Enums"]["listing_status"]
          listing_id: string
        }
        Returns: boolean
      }
      listing_meets_publish_requirements: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      submit_listing_for_publication: {
        Args: { p_listing_id: string }
        Returns: {
          archived_at: string | null
          attributes: Json | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          created_at: string
          created_by_source: string
          description: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          store_id: string | null
          title: string
          updated_at: string
          view_count: number | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      listing_status:
        | "pending"
        | "approved"
        | "rejected"
        | "hidden"
        | "sold"
        | "draft"
        | "archived"
      seller_type: "individual" | "store"
      store_listing_plan: "free" | "starter_20" | "growth_50" | "pro_100"
      store_status: "pending" | "active" | "hidden" | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      listing_status: [
        "pending",
        "approved",
        "rejected",
        "hidden",
        "sold",
        "draft",
        "archived",
      ],
      seller_type: ["individual", "store"],
      store_listing_plan: ["free", "starter_20", "growth_50", "pro_100"],
      store_status: ["pending", "active", "hidden", "rejected"],
    },
  },
} as const

