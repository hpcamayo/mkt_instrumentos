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
      admin_audit_actions: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          follow_digest_emails: boolean
          price_drop_emails: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          follow_digest_emails?: boolean
          price_drop_emails?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          follow_digest_emails?: boolean
          price_drop_emails?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_shares: {
        Row: {
          created_at: string
          id: string
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          listing_id: string
          note: string | null
          saved_price_pen: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          note?: string | null
          saved_price_pen?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          note?: string | null
          saved_price_pen?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          brand: string | null
          brand_key: string | null
          created_at: string
          id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
      listing_price_drops: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          new_price_pen: number
          old_price_pen: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          new_price_pen: number
          old_price_pen: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          new_price_pen?: number
          old_price_pen?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_drops_listing_id_fkey"
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
          rejection_codes: string[] | null
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
          rejection_codes?: string[] | null
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
          rejection_codes?: string[] | null
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
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
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
          listing_photo_count: number | null
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          title: string
          updated_at: string
          view_count: number | null
          whatsapp_phone: string
        }
        Insert: {
          archived_at?: string | null
          attributes?: Json | null
          availability_checkin_at?: string | null
          availability_confirmed_at?: string | null
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
          paused_until?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_codes?: string[] | null
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          slug: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          stock_state?: string | null
          store_id?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
          whatsapp_phone: string
        }
        Update: {
          archived_at?: string | null
          attributes?: Json | null
          availability_checkin_at?: string | null
          availability_confirmed_at?: string | null
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
          paused_until?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_codes?: string[] | null
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"]
          slug?: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          stock_state?: string | null
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
          claim_id: string | null
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          message: string
          new_price_pen: number | null
          old_price_pen: number | null
          price_drop_id: string | null
          read_at: string | null
          review_id: string | null
          store_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          listing_id?: string | null
          message: string
          new_price_pen?: number | null
          old_price_pen?: number | null
          price_drop_id?: string | null
          read_at?: string | null
          review_id?: string | null
          store_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          listing_id?: string | null
          message?: string
          new_price_pen?: number | null
          old_price_pen?: number | null
          price_drop_id?: string | null
          read_at?: string | null
          review_id?: string | null
          store_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "transaction_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_price_drop_id_fkey"
            columns: ["price_drop_id"]
            isOneToOne: false
            referencedRelation: "listing_price_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
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
            foreignKeyName: "notifications_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "verified_transactions"
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
      purchase_checkins: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_at: string | null
          buyer_user_id: string
          claim_id: string | null
          contacted_at: string
          created_at: string
          id: string
          listing_id: string
          seller_decided_at: string | null
          seller_decision: string | null
          seller_user_id: string
          store_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string | null
          buyer_user_id: string
          claim_id?: string | null
          contacted_at: string
          created_at?: string
          id?: string
          listing_id: string
          seller_decided_at?: string | null
          seller_decision?: string | null
          seller_user_id: string
          store_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string | null
          buyer_user_id?: string
          claim_id?: string | null
          contacted_at?: string
          created_at?: string
          id?: string
          listing_id?: string
          seller_decided_at?: string | null
          seller_decision?: string | null
          seller_user_id?: string
          store_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          listing_id: string | null
          reason: string
          reporter_user_id: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          status: string
          store_id: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          listing_id?: string | null
          reason: string
          reporter_user_id: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: string
          store_id?: string | null
          target_type?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          listing_id?: string | null
          reason?: string
          reporter_user_id?: string
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: string
          store_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_moderation_actions: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          reason: string
          review_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          reason: string
          review_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          reason?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_moderation_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_moderation_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_search_alerts: {
        Row: {
          active_since: string
          created_at: string
          deleted_at: string | null
          frequency: string
          id: string
          match_bucket: string
          name: string | null
          paused_at: string | null
          search_filters: Json
          search_hash: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_since?: string
          created_at?: string
          deleted_at?: string | null
          frequency: string
          id?: string
          match_bucket: string
          paused_at?: string | null
          search_filters: Json
          search_hash: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_since?: string
          created_at?: string
          deleted_at?: string | null
          frequency?: string
          id?: string
          match_bucket?: string
          name?: string | null
          paused_at?: string | null
          search_filters?: Json
          search_hash?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_search_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      store_payment_methods: {
        Row: {
          created_at: string
          holder_name: string | null
          method: Database["public"]["Enums"]["store_payment_method"]
          owner_note: string | null
          provider_label: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          holder_name?: string | null
          method: Database["public"]["Enums"]["store_payment_method"]
          owner_note?: string | null
          provider_label?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          holder_name?: string | null
          method?: Database["public"]["Enums"]["store_payment_method"]
          owner_note?: string | null
          provider_label?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_payment_methods_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
          opening_hours: string | null
          public_address: string | null
          owner_user_id: string | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
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
          opening_hours?: string | null
          owner_user_id?: string | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          show_address?: boolean
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
          opening_hours?: string | null
          owner_user_id?: string | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          show_address?: boolean
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
      transaction_claims: {
        Row: {
          attribution_type: string
          buyer_user_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          listing_id: string
          responded_at: string | null
          seller_user_id: string
          status: string
          store_id: string | null
        }
        Insert: {
          attribution_type: string
          buyer_user_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          listing_id: string
          responded_at?: string | null
          seller_user_id: string
          status: string
          store_id?: string | null
        }
        Update: {
          attribution_type?: string
          buyer_user_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          listing_id?: string
          responded_at?: string | null
          seller_user_id?: string
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_claims_buyer_user_id_fkey"
            columns: ["buyer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_claims_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_claims_seller_user_id_fkey"
            columns: ["seller_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_claims_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_reviews: {
        Row: {
          admin_hidden_at: string | null
          admin_hidden_by: string | null
          admin_hidden_reason: string | null
          comment: string | null
          direction: string
          id: string
          rating: number
          reviewer_user_id: string
          subject_store_id: string | null
          subject_user_id: string | null
          submitted_at: string
          transaction_id: string
        }
        Insert: {
          admin_hidden_at?: string | null
          admin_hidden_by?: string | null
          admin_hidden_reason?: string | null
          comment?: string | null
          direction: string
          id?: string
          rating: number
          reviewer_user_id: string
          subject_store_id?: string | null
          subject_user_id?: string | null
          submitted_at?: string
          transaction_id: string
        }
        Update: {
          admin_hidden_at?: string | null
          admin_hidden_by?: string | null
          admin_hidden_reason?: string | null
          comment?: string | null
          direction?: string
          id?: string
          rating?: number
          reviewer_user_id?: string
          subject_store_id?: string | null
          subject_user_id?: string | null
          submitted_at?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_reviews_admin_hidden_by_fkey"
            columns: ["admin_hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_subject_store_id_fkey"
            columns: ["subject_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "verified_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_transactions: {
        Row: {
          buyer_user_id: string
          claim_id: string
          id: string
          listing_id: string
          review_deadline: string
          seller_identity_type: string
          seller_user_id: string
          sold_at: string
          store_id: string | null
          verified_at: string
        }
        Insert: {
          buyer_user_id: string
          claim_id: string
          id?: string
          listing_id: string
          review_deadline: string
          seller_identity_type: string
          seller_user_id: string
          sold_at: string
          store_id?: string | null
          verified_at?: string
        }
        Update: {
          buyer_user_id?: string
          claim_id?: string
          id?: string
          listing_id?: string
          review_deadline?: string
          seller_identity_type?: string
          seller_user_id?: string
          sold_at?: string
          store_id?: string | null
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_transactions_buyer_user_id_fkey"
            columns: ["buyer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_transactions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "transaction_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_transactions_seller_user_id_fkey"
            columns: ["seller_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      review_reports: {
        Row: {
          created_at: string | null
          detail: string | null
          id: string | null
          reason: string | null
          reporter_user_id: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          id?: string | null
          reason?: string | null
          reporter_user_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          id?: string | null
          reason?: string | null
          reporter_user_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_get_store: {
        Args: { p_store_id: string }
        Returns: Database["public"]["Tables"]["stores"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      // Effortless Laria, batch "find" (20261101120000_ux_find_search.sql): search, facets, menus and the gone page.
      catalog_brand_counts: { Args: never; Returns: { brand: string; category: string; listings: number }[] }
      catalog_facets: { Args: { p_attribute_keys?: string[]; p_filters: Json; p_q?: string }; Returns: Json }
      catalog_search: {
        Args: { p_q: string }
        Returns: Database["public"]["Tables"]["listings"]["Row"][]
        SetofOptions: { from: "*"; to: "listings"; isOneToOne: false; isSetofReturn: true }
      }
      catalog_suggest: {
        Args: { p_limit?: number; p_q: string }
        Returns: { brand: string; kind: string; listings: number; model: string | null }[]
      }
      catalog_type_counts: { Args: never; Returns: { category: string; instrument_type: string | null; listings: number }[] }
      listing_gone_hint: { Args: { p_slug: string }; Returns: { category: string; instrument_type: string | null }[] }
      seller_verified_rank: { Args: { "": Database["public"]["Tables"]["listings"]["Row"] }; Returns: number }
      // End of the find batch's functions.
      // Effortless Laria integration (20261109120000).
      recent_price_drop_at: { Args: { "": Database["public"]["Tables"]["listings"]["Row"] }; Returns: string | null }
      admin_review_store_payment_method: {
        Args: {
          p_decision: string
          p_expected_revision: number
          p_method: Database["public"]["Enums"]["store_payment_method"]
          p_reason: string
          p_store_id: string
        }
        Returns: Json
      }
      answer_complaints_book_entry: {
        Args: { p_answer: string; p_entry_id: string }
        Returns: Json
      }
      answer_purchase_checkin: {
        Args: { p_bought: boolean; p_listing_id: string }
        Returns: Json
      }
      apply_email_link_action: {
        Args: { p_action: string; p_alert_id?: string; p_user_id: string }
        Returns: boolean
      }
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
      cancel_transaction_claim: {
        Args: { p_claim_id: string }
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
      claim_marketplace_email_deliveries: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: Json
      }
      claim_push_deliveries: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: Json
      }
      complete_marketplace_email_delivery: {
        Args: {
          p_delivery_id: string
          p_provider_message_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_public_submission: {
        Args: { p_fields: Json; p_id: string; p_kind: string; p_photos: Json }
        Returns: string
      }
      confirm_listing_available: {
        Args: { p_listing_id: string }
        Returns: Database["public"]["Tables"]["listings"]["Row"]
      }
      copy_owned_listing: {
        Args: { p_listing_id: string; p_mode: string }
        Returns: Database["public"]["Tables"]["listings"]["Row"]
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
      create_saved_search_alert: {
        Args: { p_filters: Json; p_frequency: string }
        Returns: {
          active_since: string
          created_at: string
          deleted_at: string | null
          frequency: string
          id: string
          match_bucket: string
          paused_at: string | null
          search_filters: Json
          search_hash: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_search_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transaction_claim: {
        Args: { p_buyer_user_id: string; p_listing_id: string }
        Returns: string
      }
      decide_purchase_checkin: {
        Args: { p_checkin_id: string; p_confirmed: boolean }
        Returns: Json
      }
      delete_push_subscription: {
        Args: { p_endpoint?: string; p_subscription_id?: string }
        Returns: boolean
      }
      delete_saved_search_alert: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
      fail_marketplace_email_delivery: {
        Args: {
          p_delivery_id: string
          p_failure_category: string
          p_failure_code: string
          p_retryable: boolean
          p_worker_id: string
        }
        Returns: string
      }
      finish_push_deliveries: {
        Args: {
          p_delivery_ids: string[]
          p_failed_device_ids?: string[]
          p_failure_code?: string
          p_gone_device_ids?: string[]
          p_outcome: string
          p_sent_device_ids?: string[]
          p_worker_id: string
        }
        Returns: number
      }
      get_account_analytics: {
        Args: { p_days?: number; p_owner_id?: string }
        Returns: Json
      }
      get_account_analytics_before_favorites: {
        Args: { p_days?: number; p_owner_id?: string }
        Returns: Json
      }
      get_account_analytics_before_transactions: {
        Args: { p_days?: number; p_owner_id?: string }
        Returns: Json
      }
      get_account_favorites: { Args: { p_page?: number }; Returns: Json }
      get_account_follows: {
        Args: never
        Returns: Json
      }
      get_account_pendientes: {
        Args: never
        Returns: Json
      }
      get_account_search_alerts: {
        Args: { p_since?: string }
        Returns: Json
      }
      get_admin_complaints_book_page: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_audit_history: {
        Args: { p_limit?: number; p_target_id: string; p_target_type: string }
        Returns: Json
      }
      get_admin_store_payment_methods: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_domain_page: {
        Args: {
          p_domain: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_admin_legacy_page: {
        Args: {
          p_listing_page?: number
          p_listing_search?: string
          p_page_size?: number
          p_user_page?: number
          p_user_search?: string
        }
        Returns: Json
      }
      get_admin_listings_page: {
        Args: {
          p_owner_type?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_admin_moderation_counts: { Args: never; Returns: Json }
      get_admin_moderation_queue: {
        Args: { p_page?: number; p_page_size?: number; p_queue: string }
        Returns: Json
      }
      get_admin_reports_page: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_reason?: string
          p_search?: string
          p_status?: string
          p_target_type?: string
        }
        Returns: Json
      }
      get_admin_review_queue: { Args: never; Returns: Json }
      get_eligible_transaction_buyers: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_favorite_destination: {
        Args: { p_listing_id: string }
        Returns: string
      }
      get_followed_arrivals: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      get_listing_statistics: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_marketplace_admin_analytics: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_marketplace_admin_analytics_before_favorites: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_marketplace_admin_analytics_before_transactions: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_new_listing_counts: {
        Args: { p_categories?: string[]; p_since: string }
        Returns: Json
      }
      get_or_create_favorite_share: {
        Args: never
        Returns: string
      }
      get_own_store: {
        Args: never
        Returns: Database["public"]["Tables"]["stores"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_pending_buyer_confirmation_count: { Args: never; Returns: number }
      get_listing_purchase_request: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_listing_stock_watch: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      get_public_review_page: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_subject_store_id?: string
          p_subject_user_id?: string
        }
        Returns: Json
      }
      get_public_seller_facts: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      set_listing_stock_watch: {
        Args: { p_listing_id: string; p_watch: boolean }
        Returns: boolean
      }
      get_public_listing_cards: {
        Args: { p_ids?: string[]; p_slugs?: string[] }
        Returns: Json
      }
      get_public_store_directory: {
        Args: never
        Returns: {
          average_rating: number | null
          city: string
          district: string | null
          id: string
          is_verified: boolean
          listing_count: number
          logo_url: string | null
          name: string
          region: string | null
          review_count: number
          slug: string
        }[]
      }
      get_public_reputation: {
        Args: {
          p_limit?: number
          p_subject_store_id?: string
          p_subject_user_id?: string
        }
        Returns: Json
      }
      get_purchase_checkin: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_shared_favorite_list: {
        Args: { p_token: string }
        Returns: Json
      }
      get_transaction_center: { Args: never; Returns: Json }
      get_store_listing_categories: {
        Args: { p_store_id: string }
        Returns: { category: string; listing_count: number }[]
      }
      get_push_subscription: {
        Args: { p_endpoint: string }
        Returns: string | null
      }
      get_store_payment_methods: {
        Args: { p_store_id: string }
        Returns: Json
      }
      get_transaction_detail: {
        Args: { p_reference_id: string }
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
      link_legacy_listing_owner: {
        Args: { p_listing_id: string; p_note: string; p_owner_user_id: string }
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
          stock_state: string | null
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
      listing_is_paused: {
        Args: { p_paused_until: string }
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
      mark_all_notifications_read: {
        Args: never
        Returns: number
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          claim_id: string | null
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          message: string
          new_price_pen: number | null
          old_price_pen: number | null
          price_drop_id: string | null
          read_at: string | null
          review_id: string | null
          store_id: string | null
          transaction_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_device_favorites: {
        Args: { p_ids: string[] }
        Returns: number
      }
      moderate_report: {
        Args: { p_reason: string; p_report_id: string; p_status: string }
        Returns: {
          created_at: string
          detail: string | null
          id: string
          listing_id: string | null
          reason: string
          reporter_user_id: string
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          status: string
          store_id: string | null
          target_type: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_review: {
        Args: { p_hidden: boolean; p_reason: string; p_review_id: string }
        Returns: boolean
      }
      prepare_daily_search_alert_emails: {
        Args: { p_digest_date: string; p_limit?: number }
        Returns: number
      }
      prepare_weekly_follow_emails: {
        Args: { p_limit?: number; p_week_start: string }
        Returns: number
      }
      record_external_sale: { Args: { p_listing_id: string }; Returns: string }
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
          stock_state: string | null
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
      report_review: {
        Args: { p_detail?: string; p_reason: string; p_review_id: string }
        Returns: string
      }
      respond_transaction_claim: {
        Args: { p_claim_id: string; p_confirmed: boolean }
        Returns: Json
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
        Args: {
          p_decision: string
          p_listing_id: string
          p_reason?: string
          p_reason_codes?: string[]
        }
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
          stock_state: string | null
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
          p_reason_codes?: string[]
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
      revoke_favorite_share: {
        Args: never
        Returns: boolean
      }
      set_email_preferences: {
        Args: { p_follow_digest_emails: boolean; p_price_drop_emails: boolean }
        Returns: {
          follow_digest_emails: boolean
          price_drop_emails: boolean
          updated_at: string
          user_id: string
        }
      }
      set_favorite_note: {
        Args: { p_listing_id: string; p_note: string }
        Returns: string | null
      }
      set_follow: {
        Args: { p_brand: string | null; p_follow: boolean; p_store_id: string | null }
        Returns: boolean
      }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: string
      }
      set_listing_favorite: {
        Args: { p_listing_id: string; p_saved: boolean }
        Returns: boolean
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
          stock_state: string | null
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
      set_owned_listing_price: {
        Args: { p_listing_id: string; p_price_pen: number }
        Returns: Database["public"]["Tables"]["listings"]["Row"]
      }
      set_owned_listings_lifecycle_bulk: {
        Args: { p_action: string; p_listing_ids: string[] }
        Returns: Json
      }
      set_owned_listings_pause: {
        Args: { p_until: string | null }
        Returns: Json
      }
      set_saved_search_alert_status: {
        Args: { p_active: boolean; p_alert_id: string }
        Returns: {
          active_since: string
          created_at: string
          deleted_at: string | null
          frequency: string
          id: string
          match_bucket: string
          paused_at: string | null
          search_filters: Json
          search_hash: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_search_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_store_payment_method: {
        Args: {
          p_holder_name?: string
          p_method: Database["public"]["Enums"]["store_payment_method"]
          p_note?: string
          p_provider_label?: string
        }
        Returns: Json
      }
      set_store_verification: {
        Args: { p_store_id: string; p_verified: boolean }
        Returns: Json
      }
      update_saved_search_alert: {
        Args: { p_alert_id: string; p_frequency: string; p_name: string | null }
        Returns: Json
      }
      withdraw_store_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["store_payment_method"] }
        Returns: Json
      }
      store_application_is_complete: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      submit_complaints_book_entry: {
        Args: {
          p_address: string
          p_claimed_amount: number | null
          p_complaint_type: string
          p_consumer_name: string
          p_declaration_accepted: boolean
          p_detail: string
          p_document_number: string
          p_document_type: string
          p_email: string
          p_guardian_name: string | null
          p_is_minor: boolean
          p_item_description: string
          p_item_type: string
          p_listing_slug: string | null
          p_phone: string
          p_request: string
        }
        Returns: { filed_at: string; sheet_number: string }[]
      }
      submit_content_report: {
        Args: {
          p_detail?: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
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
      submit_transaction_review: {
        Args: { p_comment?: string; p_rating: number; p_transaction_id: string }
        Returns: string
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
      store_payment_method:
        | "efectivo_al_recoger"
        | "yape_plin"
        | "pos_tarjeta_al_recoger"
        | "link_de_pago"
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
      store_payment_method: [
        "efectivo_al_recoger",
        "yape_plin",
        "pos_tarjeta_al_recoger",
        "link_de_pago",
      ],
      store_status: ["pending", "active", "hidden", "rejected"],
    },
  },
} as const
