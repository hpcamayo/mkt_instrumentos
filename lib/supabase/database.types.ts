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
      listing_edit_attempts: {
        Row: {
          attempt_id: string
          created_at: string
          listing_id: string
          payload_hash: string
          result: Json
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          listing_id: string
          payload_hash: string
          result: Json
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          listing_id?: string
          payload_hash?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_edit_attempts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_edit_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photo_cleanup_claims: {
        Row: {
          bucket: string
          created_at: string
          path: string
        }
        Insert: {
          bucket: string
          created_at?: string
          path: string
        }
        Update: {
          bucket?: string
          created_at?: string
          path?: string
        }
        Relationships: []
      }
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
      listing_revision_photos: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          revision_id: string
          sort_order: number
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          revision_id: string
          sort_order: number
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          revision_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_revision_photos_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "listing_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_revisions: {
        Row: {
          attributes: Json | null
          brand: string | null
          category: string | null
          changed_fields: string[]
          condition: string | null
          created_at: string
          id: string
          instrument_type: string | null
          listing_id: string
          model: string | null
          owner_user_id: string
          rejection_reason: string | null
          resolution_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string | null
          submitted_at: string
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          attributes?: Json | null
          brand?: string | null
          category?: string | null
          changed_fields: string[]
          condition?: string | null
          created_at?: string
          id?: string
          instrument_type?: string | null
          listing_id: string
          model?: string | null
          owner_user_id: string
          rejection_reason?: string | null
          resolution_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          attributes?: Json | null
          brand?: string | null
          category?: string | null
          changed_fields?: string[]
          condition?: string | null
          created_at?: string
          id?: string
          instrument_type?: string | null
          listing_id?: string
          model?: string | null
          owner_user_id?: string
          rejection_reason?: string | null
          resolution_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_revisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_revisions_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_revisions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          store_id: string | null
          title: string
          updated_at: string
          view_count: number | null
          whatsapp_phone: string
          listing_photo_count: number | null
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
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_source?: string | null
          id?: string
          instrument_type?: string | null
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
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
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_source?: string | null
          id?: string
          instrument_type?: string | null
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
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
            foreignKeyName: "listings_relisted_from_listing_id_fkey"
            columns: ["relisted_from_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
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
      marketplace_event_types: {
        Row: {
          created_at: string
          event_type: string
        }
        Insert: {
          created_at?: string
          event_type: string
        }
        Update: {
          created_at?: string
          event_type?: string
        }
        Relationships: []
      }
      marketplace_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          id: string
          identity_key: string | null
          listing_id: string | null
          metadata: Json
          seller_user_id: string | null
          session_id: string | null
          source: string
          store_id: string | null
          submission_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          id?: string
          identity_key?: string | null
          listing_id?: string | null
          metadata?: Json
          seller_user_id?: string | null
          session_id?: string | null
          source: string
          store_id?: string | null
          submission_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          id?: string
          identity_key?: string | null
          listing_id?: string | null
          metadata?: Json
          seller_user_id?: string | null
          session_id?: string | null
          source?: string
          store_id?: string | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "marketplace_event_types"
            referencedColumns: ["event_type"]
          },
          {
            foreignKeyName: "marketplace_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_seller_user_id_fkey"
            columns: ["seller_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          message: string
          read_at: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          listing_id?: string | null
          message: string
          read_at?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          listing_id?: string | null
          message?: string
          read_at?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      store_photos: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_photos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
      apply_owned_listing_edit: {
        Args: {
          p_immediate?: Json
          p_listing_id: string
          p_moderated?: Json
          p_photos?: Json
        }
        Returns: Json
      }
      auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      can_add_listing_photo: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      can_manage_listing: { Args: { p_listing_id: string }; Returns: boolean }
      can_remove_listing_photo: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      claim_listing_photo_cleanup: {
        Args: {
          p_bucket: string
          p_listing_id: string
          p_paths: string[]
          p_user_id: string
        }
        Returns: string[]
      }
      complete_public_submission: {
        Args: { p_fields: Json; p_id: string; p_kind: string; p_photos: Json }
        Returns: string
      }
      create_account_notification: {
        Args: {
          p_event_type: string
          p_listing_id?: string
          p_store_id?: string
          p_user_id: string
        }
        Returns: string
      }
      get_account_analytics: {
        Args: { p_days?: number; p_owner_id?: string }
        Returns: Json
      }
      get_marketplace_admin_analytics: {
        Args: { p_days?: number }
        Returns: Json
      }
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
      listing_accepts_direct_photo_edits: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_attribute_keys_are_valid: {
        Args: { p_attributes: Json; p_instrument_type: string }
        Returns: boolean
      }
      listing_has_status: {
        Args: {
          expected_status: Database["public"]["Enums"]["listing_status"]
          listing_id: string
        }
        Returns: boolean
      }
      listing_is_public: { Args: { p_listing_id: string }; Returns: boolean }
      listing_meets_publish_requirements: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_owner_can_edit: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_photo_count: {
        Args: { "": Database["public"]["Tables"]["listings"]["Row"] }
        Returns: {
          error: true
        } & "the function public.listing_photo_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      listing_photo_set_is_valid: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: boolean
      }
      listing_taxonomy_is_valid: {
        Args: { p_category: string; p_instrument_type: string }
        Returns: boolean
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          message: string
          read_at: string | null
          store_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_marketplace_event: {
        Args: {
          p_actor_user_id?: string
          p_event_id: string
          p_event_type: string
          p_listing_id?: string
          p_metadata?: Json
          p_session_id: string
          p_source?: string
          p_store_id?: string
          p_submission_id?: string
        }
        Returns: Json
      }
      relist_sold_listing: {
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
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_reason: string | null
          relisted_from_listing_id: string | null
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
      replace_listing_photos: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: undefined
      }
      resubmit_store_application: {
        Args: { p_store_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_listing: {
        Args: { p_decision: string; p_listing_id: string; p_reason?: string }
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
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_reason: string | null
          relisted_from_listing_id: string | null
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
      review_listing_revision: {
        Args: {
          p_decision: string
          p_expected_version: number
          p_reason?: string
          p_revision_id: string
        }
        Returns: {
          attributes: Json | null
          brand: string | null
          category: string | null
          changed_fields: string[]
          condition: string | null
          created_at: string
          id: string
          instrument_type: string | null
          listing_id: string
          model: string | null
          owner_user_id: string
          rejection_reason: string | null
          resolution_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string | null
          submitted_at: string
          title: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "listing_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_store_application: {
        Args: { p_decision: string; p_reason?: string; p_store_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_owned_listing_lifecycle: {
        Args: { p_action: string; p_listing_id: string }
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
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_reason: string | null
          relisted_from_listing_id: string | null
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
      set_store_verification: {
        Args: { p_store_id: string; p_verified: boolean }
        Returns: Json
      }
      store_application_is_complete: {
        Args: { p_store_id: string }
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
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          instrument_type: string | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_reason: string | null
          relisted_from_listing_id: string | null
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
      update_owned_listing: {
        Args: {
          p_attempt_id?: string
          p_immediate?: Json
          p_listing_id: string
          p_moderated?: Json
          p_photos?: Json
        }
        Returns: Json
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
