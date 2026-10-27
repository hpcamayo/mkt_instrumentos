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
      account_devices: {
        Row: {
          device_hash: string
          first_seen_at: string
          id: string
          label: string
          last_seen_at: string
          last_session_id: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          device_hash: string
          first_seen_at?: string
          id?: string
          label: string
          last_seen_at?: string
          last_session_id?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          device_hash?: string
          first_seen_at?: string
          id?: string
          label?: string
          last_seen_at?: string
          last_session_id?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
      artist_profiles: {
        Row: {
          display_name: string
          link_url: string | null
          revoked_at: string | null
          slug: string
          story: string | null
          updated_at: string
          user_id: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          display_name: string
          link_url?: string | null
          revoked_at?: string | null
          slug: string
          story?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          display_name?: string
          link_url?: string | null
          revoked_at?: string | null
          slug?: string
          story?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_track_records: {
        Row: {
          enabled: boolean
          enabled_at: string | null
          token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string | null
          token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_track_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          depth: number
          id: string
          label_en: string
          label_es: string
          laria_category: string | null
          laria_instrument_type: string | null
          parent_id: string | null
          sort_order: number
          terms_es: string[]
        }
        Insert: {
          depth: number
          id: string
          label_en: string
          label_es: string
          laria_category?: string | null
          laria_instrument_type?: string | null
          parent_id?: string | null
          sort_order?: number
          terms_es?: string[]
        }
        Update: {
          depth?: number
          id?: string
          label_en?: string
          label_es?: string
          laria_category?: string | null
          laria_instrument_type?: string | null
          parent_id?: string | null
          sort_order?: number
          terms_es?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_category_terms"
            referencedColumns: ["category_id"]
          },
        ]
      }
      catalog_conflicts: {
        Row: {
          created_at: string
          field: string
          id: string
          product_id: string
          severity: string
          values: Json
        }
        Insert: {
          created_at?: string
          field: string
          id: string
          product_id: string
          severity: string
          values: Json
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          product_id?: string
          severity?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "catalog_conflicts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_lookup_terms: {
        Row: {
          created_at: string
          kind: string
          target: string | null
          term: string
        }
        Insert: {
          created_at?: string
          kind: string
          target?: string | null
          term: string
        }
        Update: {
          created_at?: string
          kind?: string
          target?: string | null
          term?: string
        }
        Relationships: []
      }
      catalog_manufacturer_aliases: {
        Row: {
          alias: string
          alias_key: string
          manufacturer_id: string
        }
        Insert: {
          alias: string
          alias_key: string
          manufacturer_id: string
        }
        Update: {
          alias?: string
          alias_key?: string
          manufacturer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_manufacturer_aliases_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "catalog_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_manufacturers: {
        Row: {
          active: boolean | null
          aliases: string[]
          canonical_name: string
          country: string | null
          created_at: string
          fact_source: string | null
          founded_year: number | null
          id: string
          is_curated: boolean
          legal_name: string | null
          normalized_name: string
          official_url: string | null
          parent_id: string | null
          slug: string
          updated_at: string
          wikidata_id: string | null
        }
        Insert: {
          active?: boolean | null
          aliases?: string[]
          canonical_name: string
          country?: string | null
          created_at?: string
          fact_source?: string | null
          founded_year?: number | null
          id: string
          is_curated?: boolean
          legal_name?: string | null
          normalized_name: string
          official_url?: string | null
          parent_id?: string | null
          slug: string
          updated_at?: string
          wikidata_id?: string | null
        }
        Update: {
          active?: boolean | null
          aliases?: string[]
          canonical_name?: string
          country?: string | null
          created_at?: string
          fact_source?: string | null
          founded_year?: number | null
          id?: string
          is_curated?: boolean
          legal_name?: string | null
          normalized_name?: string
          official_url?: string | null
          parent_id?: string | null
          slug?: string
          updated_at?: string
          wikidata_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_manufacturers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_aliases: {
        Row: {
          alias: string
          alias_key: string
          alias_type: Database["public"]["Enums"]["catalog_alias_type"]
          confidence: number
          created_at: string
          id: string
          is_ambiguous: boolean
          normalized_alias: string
          product_id: string
          source_id: string | null
        }
        Insert: {
          alias: string
          alias_key: string
          alias_type: Database["public"]["Enums"]["catalog_alias_type"]
          confidence?: number
          created_at?: string
          id: string
          is_ambiguous?: boolean
          normalized_alias: string
          product_id: string
          source_id?: string | null
        }
        Update: {
          alias?: string
          alias_key?: string
          alias_type?: Database["public"]["Enums"]["catalog_alias_type"]
          confidence?: number
          created_at?: string
          id?: string
          is_ambiguous?: boolean
          normalized_alias?: string
          product_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_aliases_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_attributes: {
        Row: {
          attribute_key: string
          conflict_values: string[]
          created_at: string
          id: string
          product_id: string
          provenance: string
          sources: string[]
          trusted: boolean
          unit: string | null
          value: string
          value_es: string | null
          value_num: number | null
          weight: number
        }
        Insert: {
          attribute_key: string
          conflict_values?: string[]
          created_at?: string
          id: string
          product_id: string
          provenance: string
          sources?: string[]
          trusted?: boolean
          unit?: string | null
          value: string
          value_es?: string | null
          value_num?: number | null
          weight: number
        }
        Update: {
          attribute_key?: string
          conflict_values?: string[]
          created_at?: string
          id?: string
          product_id?: string
          provenance?: string
          sources?: string[]
          trusted?: boolean
          unit?: string | null
          value?: string
          value_es?: string | null
          value_num?: number | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_external_ids: {
        Row: {
          product_id: string
          scheme: string
          source_id: string | null
          value: string
        }
        Insert: {
          product_id: string
          scheme: string
          source_id?: string | null
          value: string
        }
        Update: {
          product_id?: string
          scheme?: string
          source_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_external_ids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_external_ids_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_families: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          manufacturer_id: string
          name: string
          normalized_name: string
          source_ids: string[]
          source_urls: string[]
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id: string
          manufacturer_id: string
          name: string
          normalized_name: string
          source_ids?: string[]
          source_urls?: string[]
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          manufacturer_id?: string
          name?: string
          normalized_name?: string
          source_ids?: string[]
          source_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_families_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_families_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_category_terms"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "catalog_product_families_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "catalog_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_sources: {
        Row: {
          confidence: number
          evidence_type: string
          extraction_method: string
          merge_reason: string
          product_id: string
          retrieved_at: string | null
          source_id: string
          source_manufacturer_name: string | null
          source_model_name: string
          source_record_id: string
          source_url: string | null
        }
        Insert: {
          confidence: number
          evidence_type: string
          extraction_method: string
          merge_reason: string
          product_id: string
          retrieved_at?: string | null
          source_id: string
          source_manufacturer_name?: string | null
          source_model_name: string
          source_record_id: string
          source_url?: string | null
        }
        Update: {
          confidence?: number
          evidence_type?: string
          extraction_method?: string
          merge_reason?: string
          product_id?: string
          retrieved_at?: string | null
          source_id?: string
          source_manufacturer_name?: string | null
          source_model_name?: string
          source_record_id?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_specs: {
        Row: {
          created_at: string
          id: string
          normalized_value: number | null
          product_id: string
          source_id: string | null
          spec_key: string
          spec_value: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          id: string
          normalized_value?: number | null
          product_id: string
          source_id?: string | null
          spec_key: string
          spec_value: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          normalized_value?: number | null
          product_id?: string
          source_id?: string | null
          spec_key?: string
          spec_value?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_specs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_specs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_variants: {
        Row: {
          color: string | null
          configuration: string | null
          created_at: string
          finish: string | null
          gtin: string | null
          id: string
          product_id: string
          region: string | null
          size: string | null
          sku: string | null
          sku_key: string | null
          source_id: string | null
          variant_name: string
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          color?: string | null
          configuration?: string | null
          created_at?: string
          finish?: string | null
          gtin?: string | null
          id: string
          product_id: string
          region?: string | null
          size?: string | null
          sku?: string | null
          sku_key?: string | null
          source_id?: string | null
          variant_name: string
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          color?: string | null
          configuration?: string | null
          created_at?: string
          finish?: string | null
          gtin?: string | null
          id?: string
          product_id?: string
          region?: string | null
          size?: string | null
          sku?: string | null
          sku_key?: string | null
          source_id?: string | null
          variant_name?: string
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_product_variants_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_products: {
        Row: {
          active_status: string
          canonical_model_name: string
          category_confidence: string | null
          category_id: string | null
          confidence: number
          country_of_origin: string | null
          created_at: string
          description: string | null
          detail_group: string | null
          detail_status: string
          discontinuation_year: number | null
          entity_level: string
          entity_level_source: string | null
          family_id: string | null
          family_product_id: string | null
          flags: string[]
          id: string
          identity_domain: string | null
          independent_source_groups: number
          introduction_year: number | null
          manufacturer_id: string
          missing_attributes: string[]
          model_code: string | null
          model_code_key: string | null
          model_key: string
          normalized_model_name: string
          parent_product_id: string | null
          product_type: string
          publish_ready: boolean
          quality_flags: string[]
          quality_status: string
          reject_reason: string | null
          source_count: number
          superseded_at: string | null
          untrusted_attributes: string[]
          updated_at: string
          variant_attributes: string[]
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
        }
        Insert: {
          active_status?: string
          canonical_model_name: string
          category_confidence?: string | null
          category_id?: string | null
          confidence: number
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          detail_group?: string | null
          detail_status?: string
          discontinuation_year?: number | null
          entity_level?: string
          entity_level_source?: string | null
          family_id?: string | null
          family_product_id?: string | null
          flags?: string[]
          id: string
          identity_domain?: string | null
          independent_source_groups?: number
          introduction_year?: number | null
          manufacturer_id: string
          missing_attributes?: string[]
          model_code?: string | null
          model_code_key?: string | null
          model_key: string
          normalized_model_name: string
          parent_product_id?: string | null
          product_type?: string
          publish_ready?: boolean
          quality_flags?: string[]
          quality_status?: string
          reject_reason?: string | null
          source_count?: number
          superseded_at?: string | null
          untrusted_attributes?: string[]
          updated_at?: string
          variant_attributes?: string[]
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
        }
        Update: {
          active_status?: string
          canonical_model_name?: string
          category_confidence?: string | null
          category_id?: string | null
          confidence?: number
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          detail_group?: string | null
          detail_status?: string
          discontinuation_year?: number | null
          entity_level?: string
          entity_level_source?: string | null
          family_id?: string | null
          family_product_id?: string | null
          flags?: string[]
          id?: string
          identity_domain?: string | null
          independent_source_groups?: number
          introduction_year?: number | null
          manufacturer_id?: string
          missing_attributes?: string[]
          model_code?: string | null
          model_code_key?: string | null
          model_key?: string
          normalized_model_name?: string
          parent_product_id?: string | null
          product_type?: string
          publish_ready?: boolean
          quality_flags?: string[]
          quality_status?: string
          reject_reason?: string | null
          source_count?: number
          superseded_at?: string | null
          untrusted_attributes?: string[]
          updated_at?: string
          variant_attributes?: string[]
          verification_status?: Database["public"]["Enums"]["catalog_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_category_terms"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "catalog_products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "catalog_product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_family_product_id_fkey"
            columns: ["family_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "catalog_manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_review_candidates: {
        Row: {
          ai_confidence: string | null
          ai_model: string | null
          ai_reason: string | null
          ai_variant_name: string | null
          ai_verdict: string | null
          created_at: string
          decision: string | null
          details: Json
          id: string
          keys_a: string[]
          keys_b: string[]
          kind: string
          manufacturer_name: string | null
          manufacturer_slug: string | null
          model_a: string | null
          model_b: string | null
          pair_key: string | null
          priority: number
          product_a: string | null
          product_b: string | null
          reason: string
          records_a: string[]
          records_b: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          rule_confidence: string | null
          rule_reason: string | null
          rule_verdict: string | null
          score: number | null
          status: Database["public"]["Enums"]["catalog_review_status"]
        }
        Insert: {
          ai_confidence?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_variant_name?: string | null
          ai_verdict?: string | null
          created_at?: string
          decision?: string | null
          details?: Json
          id: string
          keys_a?: string[]
          keys_b?: string[]
          kind: string
          manufacturer_name?: string | null
          manufacturer_slug?: string | null
          model_a?: string | null
          model_b?: string | null
          pair_key?: string | null
          priority?: number
          product_a?: string | null
          product_b?: string | null
          reason: string
          records_a?: string[]
          records_b?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_confidence?: string | null
          rule_reason?: string | null
          rule_verdict?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["catalog_review_status"]
        }
        Update: {
          ai_confidence?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_variant_name?: string | null
          ai_verdict?: string | null
          created_at?: string
          decision?: string | null
          details?: Json
          id?: string
          keys_a?: string[]
          keys_b?: string[]
          kind?: string
          manufacturer_name?: string | null
          manufacturer_slug?: string | null
          model_a?: string | null
          model_b?: string | null
          pair_key?: string | null
          priority?: number
          product_a?: string | null
          product_b?: string | null
          reason?: string
          records_a?: string[]
          records_b?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_confidence?: string | null
          rule_reason?: string | null
          rule_verdict?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["catalog_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_review_candidates_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_review_candidates_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_review_decisions: {
        Row: {
          ai_verdict: string | null
          decided_at: string
          decided_by: string | null
          decided_by_email: string | null
          keys_a: string[]
          keys_b: string[]
          kind: string | null
          manufacturer_slug: string
          model_a: string
          model_b: string | null
          note: string | null
          pair_key: string
          records_a: string[]
          records_b: string[]
          rule_verdict: string | null
          source: string
          variant_name: string | null
          verdict: string
        }
        Insert: {
          ai_verdict?: string | null
          decided_at?: string
          decided_by?: string | null
          decided_by_email?: string | null
          keys_a?: string[]
          keys_b?: string[]
          kind?: string | null
          manufacturer_slug: string
          model_a: string
          model_b?: string | null
          note?: string | null
          pair_key: string
          records_a?: string[]
          records_b?: string[]
          rule_verdict?: string | null
          source?: string
          variant_name?: string | null
          verdict: string
        }
        Update: {
          ai_verdict?: string | null
          decided_at?: string
          decided_by?: string | null
          decided_by_email?: string | null
          keys_a?: string[]
          keys_b?: string[]
          kind?: string | null
          manufacturer_slug?: string
          model_a?: string
          model_b?: string | null
          note?: string | null
          pair_key?: string
          records_a?: string[]
          records_b?: string[]
          rule_verdict?: string | null
          source?: string
          variant_name?: string | null
          verdict?: string
        }
        Relationships: []
      }
      catalog_search_log: {
        Row: {
          candidates: Json
          created_at: string
          decision: string | null
          id: number
          latency_ms: number | null
          manufacturer_hint: string | null
          match_type: string | null
          product_id: string | null
          query_text: string
          reasons: string[] | null
          score: number | null
          source: string
          tier: string | null
          warning: string | null
        }
        Insert: {
          candidates?: Json
          created_at?: string
          decision?: string | null
          id?: never
          latency_ms?: number | null
          manufacturer_hint?: string | null
          match_type?: string | null
          product_id?: string | null
          query_text: string
          reasons?: string[] | null
          score?: number | null
          source: string
          tier?: string | null
          warning?: string | null
        }
        Update: {
          candidates?: Json
          created_at?: string
          decision?: string | null
          id?: never
          latency_ms?: number | null
          manufacturer_hint?: string | null
          match_type?: string | null
          product_id?: string | null
          query_text?: string
          reasons?: string[] | null
          score?: number | null
          source?: string
          tier?: string | null
          warning?: string | null
        }
        Relationships: []
      }
      catalog_source_records: {
        Row: {
          payload: Json
          product_id: string | null
          source_id: string
          source_record_id: string
          status: string
        }
        Insert: {
          payload: Json
          product_id?: string | null
          source_id: string
          source_record_id: string
          status: string
        }
        Update: {
          payload?: Json
          product_id?: string | null
          source_id?: string
          source_record_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_source_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_source_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sources: {
        Row: {
          access_method: string | null
          authority_level: Database["public"]["Enums"]["catalog_authority_level"]
          created_at: string
          id: string
          independence_group: string | null
          license: string | null
          name: string
          notes: string | null
          publisher: string | null
          retrieved_at: string | null
          robots_status: string | null
          source_type: string | null
          url: string | null
        }
        Insert: {
          access_method?: string | null
          authority_level: Database["public"]["Enums"]["catalog_authority_level"]
          created_at?: string
          id: string
          independence_group?: string | null
          license?: string | null
          name: string
          notes?: string | null
          publisher?: string | null
          retrieved_at?: string | null
          robots_status?: string | null
          source_type?: string | null
          url?: string | null
        }
        Update: {
          access_method?: string | null
          authority_level?: Database["public"]["Enums"]["catalog_authority_level"]
          created_at?: string
          id?: string
          independence_group?: string | null
          license?: string | null
          name?: string
          notes?: string | null
          publisher?: string | null
          retrieved_at?: string | null
          robots_status?: string | null
          source_type?: string | null
          url?: string | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          intro: string
          published: boolean
          sets: Json
          slug: string
          sort_order: number
          starts_on: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          intro: string
          published?: boolean
          sets: Json
          slug: string
          sort_order?: number
          starts_on?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          intro?: string
          published?: boolean
          sets?: Json
          slug?: string
          sort_order?: number
          starts_on?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      complaints_book_entries: {
        Row: {
          address: string
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          claimed_amount: number | null
          complaint_type: string
          consumer_name: string
          created_at: string
          declaration_accepted: boolean
          detail: string
          document_number: string
          document_type: string
          email: string
          guardian_name: string | null
          id: string
          is_minor: boolean
          item_description: string
          item_type: string
          listing_slug: string | null
          phone: string
          request: string
          sheet_number: string
          sheet_sequence: number
          sheet_year: number
          status: string
          user_id: string | null
        }
        Insert: {
          address: string
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          claimed_amount?: number | null
          complaint_type: string
          consumer_name: string
          created_at?: string
          declaration_accepted: boolean
          detail: string
          document_number: string
          document_type: string
          email: string
          guardian_name?: string | null
          id?: string
          is_minor?: boolean
          item_description: string
          item_type: string
          listing_slug?: string | null
          phone: string
          request: string
          sheet_number: string
          sheet_sequence: number
          sheet_year: number
          status?: string
          user_id?: string | null
        }
        Update: {
          address?: string
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          claimed_amount?: number | null
          complaint_type?: string
          consumer_name?: string
          created_at?: string
          declaration_accepted?: boolean
          detail?: string
          document_number?: string
          document_type?: string
          email?: string
          guardian_name?: string | null
          id?: string
          is_minor?: boolean
          item_description?: string
          item_type?: string
          listing_slug?: string | null
          phone?: string
          request?: string
          sheet_number?: string
          sheet_sequence?: number
          sheet_year?: number
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      demand_report_rows: {
        Row: {
          city: string | null
          filters: Json
          listed: number
          month: string
          people: number
          position: number
          section: string
        }
        Insert: {
          city?: string | null
          filters: Json
          listed: number
          month: string
          people: number
          position: number
          section: string
        }
        Update: {
          city?: string | null
          filters?: Json
          listed?: number
          month?: string
          people?: number
          position?: number
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_report_rows_month_fkey"
            columns: ["month"]
            isOneToOne: false
            referencedRelation: "demand_reports"
            referencedColumns: ["month"]
          },
        ]
      }
      demand_reports: {
        Row: {
          alert_holders: number | null
          built_at: string
          month: string
          period_end: string
          period_start: string
          searchers: number | null
          searchers_in_lima: number | null
          searchers_with_city: number | null
          threshold: number
        }
        Insert: {
          alert_holders?: number | null
          built_at?: string
          month: string
          period_end: string
          period_start: string
          searchers?: number | null
          searchers_in_lima?: number | null
          searchers_with_city?: number | null
          threshold: number
        }
        Update: {
          alert_holders?: number | null
          built_at?: string
          month?: string
          period_end?: string
          period_start?: string
          searchers?: number | null
          searchers_in_lima?: number | null
          searchers_with_city?: number | null
          threshold?: number
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
        Relationships: [
          {
            foreignKeyName: "email_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "favorite_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
          brand_key?: string | null
          created_at?: string
          id?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          brand_key?: string | null
          created_at?: string
          id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gear_items: {
        Row: {
          attributes: Json
          brand: string
          category: string
          created_at: string
          id: string
          instrument_type: string
          model: string
          note: string | null
          purchased_on: string | null
          sale_listing_id: string | null
          serial: string | null
          serial_key: string | null
          source: string
          source_listing_id: string | null
          title: string
          transaction_id: string | null
          updated_at: string
          user_id: string
          warranty_until: string | null
        }
        Insert: {
          attributes?: Json
          brand: string
          category: string
          created_at?: string
          id?: string
          instrument_type: string
          model?: string
          note?: string | null
          purchased_on?: string | null
          sale_listing_id?: string | null
          serial?: string | null
          serial_key?: string | null
          source?: string
          source_listing_id?: string | null
          title: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          warranty_until?: string | null
        }
        Update: {
          attributes?: Json
          brand?: string
          category?: string
          created_at?: string
          id?: string
          instrument_type?: string
          model?: string
          note?: string | null
          purchased_on?: string | null
          sale_listing_id?: string | null
          serial?: string | null
          serial_key?: string | null
          source?: string
          source_listing_id?: string | null
          title?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gear_items_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gear_items_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gear_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "verified_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gear_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gear_reminders: {
        Row: {
          created_at: string
          every_months: number
          gear_item_id: string
          kind: string
          last_changed_on: string
          last_sent_on: string | null
          next_due_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          every_months: number
          gear_item_id: string
          kind: string
          last_changed_on: string
          last_sent_on?: string | null
          next_due_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          every_months?: number
          gear_item_id?: string
          kind?: string
          last_changed_on?: string
          last_sent_on?: string | null
          next_due_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gear_reminders_gear_item_id_fkey"
            columns: ["gear_item_id"]
            isOneToOne: true
            referencedRelation: "gear_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gear_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_tickets: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          client_hash: string | null
          code: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          page_path: string | null
          status: string
          topic: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          client_hash?: string | null
          code: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          page_path?: string | null
          status?: string
          topic: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          client_hash?: string | null
          code?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          page_path?: string | null
          status?: string
          topic?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_item_serials: {
        Row: {
          created_at: string
          id: string
          item_id: string
          serial_norm: string
          serial_raw: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          serial_norm: string
          serial_raw: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          serial_norm?: string
          serial_raw?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_serials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      laria_campaign_entries: {
        Row: {
          after_campaign: string
          applied_at: string | null
          campaign_id: string
          campaign_price_pen: number
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          listing_id: string
          price_before_pen: number
          reference_price_pen: number
          status: string
          status_reason: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          after_campaign: string
          applied_at?: string | null
          campaign_id: string
          campaign_price_pen: number
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          listing_id: string
          price_before_pen: number
          reference_price_pen: number
          status?: string
          status_reason?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          after_campaign?: string
          applied_at?: string | null
          campaign_id?: string
          campaign_price_pen?: number
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          listing_id?: string
          price_before_pen?: number
          reference_price_pen?: number
          status?: string
          status_reason?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laria_campaign_entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "laria_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laria_campaign_entries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laria_campaign_entries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laria_campaign_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      laria_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          id: string
          min_discount_pct: number
          name: string
          revision: number
          slug: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          id?: string
          min_discount_pct?: number
          name: string
          revision?: number
          slug: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          id?: string
          min_discount_pct?: number
          name?: string
          revision?: number
          slug?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_companions: {
        Row: {
          companion_id: string
          created_at: string
          listing_id: string
          sort_order: number
        }
        Insert: {
          companion_id: string
          created_at?: string
          listing_id: string
          sort_order?: number
        }
        Update: {
          companion_id?: string
          created_at?: string
          listing_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_companions_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_companions_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_companions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_companions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_consignments: {
        Row: {
          accepted_at: string | null
          created_at: string
          ended_at: string | null
          ended_by: string | null
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          listing_id: string
          owner_user_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          listing_id: string
          owner_user_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          listing_id?: string
          owner_user_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_consignments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_consignments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_consignments_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_consignments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_drafts: {
        Row: {
          created_at: string
          form: Json
          id: string
          inventory_item_id: string | null
          kind: string
          owner_user_id: string
          photos: Json
          sound_clip: Json | null
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          form?: Json
          id: string
          inventory_item_id?: string | null
          kind: string
          owner_user_id?: string
          photos?: Json
          sound_clip?: Json | null
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          form?: Json
          id?: string
          inventory_item_id?: string | null
          kind?: string
          owner_user_id?: string
          photos?: Json
          sound_clip?: Json | null
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_drafts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "listing_edit_attempts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
      listing_maker_details: {
        Row: {
          artist_note: string | null
          handmade: boolean
          listing_id: string
          made_to_order_weeks: number | null
          updated_at: string
        }
        Insert: {
          artist_note?: string | null
          handmade?: boolean
          listing_id: string
          made_to_order_weeks?: number | null
          updated_at?: string
        }
        Update: {
          artist_note?: string | null
          handmade?: boolean
          listing_id?: string
          made_to_order_weeks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_maker_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_maker_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
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
      listing_photo_fingerprints: {
        Row: {
          created_at: string
          dhash: unknown
          listing_id: string
          owner_key: string
          photo_key: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          dhash: unknown
          listing_id: string
          owner_key: string
          photo_key: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          dhash?: unknown
          listing_id?: string
          owner_key?: string
          photo_key?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_photo_fingerprints_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photo_fingerprints_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
          {
            foreignKeyName: "listing_price_drops_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_price_history: {
        Row: {
          id: number
          listing_id: string
          price_pen: number
          source: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          id?: never
          listing_id: string
          price_pen: number
          source: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          id?: never
          listing_id?: string
          price_pen?: number
          source?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_price_steps: {
        Row: {
          created_at: string
          finished_reason: string | null
          floor_pen: number
          interval_days: number
          last_step_at: string | null
          listing_id: string
          next_step_at: string
          only_without_contacts: boolean
          owner_user_id: string
          start_price_pen: number
          status: string
          step_percent: number
          steps_taken: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          finished_reason?: string | null
          floor_pen: number
          interval_days: number
          last_step_at?: string | null
          listing_id: string
          next_step_at: string
          only_without_contacts?: boolean
          owner_user_id: string
          start_price_pen: number
          status?: string
          step_percent: number
          steps_taken?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          finished_reason?: string | null
          floor_pen?: number
          interval_days?: number
          last_step_at?: string | null
          listing_id?: string
          next_step_at?: string
          only_without_contacts?: boolean
          owner_user_id?: string
          start_price_pen?: number
          status?: string
          step_percent?: number
          steps_taken?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_steps_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_steps_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_steps_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_private_offer_recipients: {
        Row: {
          created_at: string
          offer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          offer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_private_offer_recipients_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "listing_private_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_private_offer_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_private_offers: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          listing_id: string
          message: string | null
          owner_user_id: string
          price_pen: number
          public_price_pen: number
          recipient_count: number
          status: string
          valid_until: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          owner_user_id: string
          price_pen: number
          public_price_pen: number
          recipient_count: number
          status?: string
          valid_until: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          owner_user_id?: string
          price_pen?: number
          public_price_pen?: number
          recipient_count?: number
          status?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_private_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_private_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_private_offers_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_provenance: {
        Row: {
          linked_at: string
          linked_by: string
          listing_id: string
          transaction_id: string
        }
        Insert: {
          linked_at?: string
          linked_by: string
          listing_id: string
          transaction_id: string
        }
        Update: {
          linked_at?: string
          linked_by?: string
          listing_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_provenance_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_provenance_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_provenance_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_provenance_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "verified_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          asker_user_id: string
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          listing_id: string
          status: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asker_user_id: string
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          listing_id: string
          status?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asker_user_id?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          listing_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_questions_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_asker_user_id_fkey"
            columns: ["asker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_red_flags: {
        Row: {
          created_at: string
          detail: Json
          id: string
          kind: string
          listing_id: string
          matched_listing_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          listing_id: string
          matched_listing_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          listing_id?: string
          matched_listing_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_red_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_red_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_red_flags_matched_listing_id_fkey"
            columns: ["matched_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_red_flags_matched_listing_id_fkey"
            columns: ["matched_listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
            foreignKeyName: "listing_revisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
      listing_serials: {
        Row: {
          listing_id: string
          serial_norm: string
          serial_raw: string
          updated_at: string
        }
        Insert: {
          listing_id: string
          serial_norm: string
          serial_raw: string
          updated_at?: string
        }
        Update: {
          listing_id?: string
          serial_norm?: string
          serial_raw?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_serials_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_serials_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_sound_clips: {
        Row: {
          clip_url: string
          created_at: string
          duration_seconds: number
          listing_id: string
          mime_type: string
        }
        Insert: {
          clip_url: string
          created_at?: string
          duration_seconds: number
          listing_id: string
          mime_type: string
        }
        Update: {
          clip_url?: string
          created_at?: string
          duration_seconds?: number
          listing_id?: string
          mime_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_sound_clips_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_sound_clips_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_stock_watches: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_stock_watches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_stock_watches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
          listing_photo_count: number | null
        }
        Insert: {
          accepts_part_payment?: boolean | null
          accepts_trades?: boolean
          archived_at?: string | null
          attributes?: Json | null
          availability_checkin_at?: string | null
          availability_confirmed_at?: string | null
          brand?: string | null
          can_try?: boolean
          category: string
          city: string
          condition?: string | null
          contact_name?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by_source?: string
          delivery_pickup?: boolean
          description?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_source?: string | null
          id?: string
          installments_max?: number | null
          instrument_type?: string | null
          lima_delivery?: string | null
          listing_flags?: string[]
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          pickup_area?: string | null
          previous_price_pen?: number | null
          price_changed_at?: string | null
          price_dropped_at?: string | null
          price_mode?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_codes?: string[] | null
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
          restock_expected_on?: string | null
          returns_days?: number | null
          returns_note?: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers?: string[]
          shipping_payment?: string | null
          ships_provinces?: boolean
          slug: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          stock_state?: string | null
          store_id?: string | null
          store_terms_source?: string | null
          title: string
          trade_categories?: string[]
          trade_wants?: string | null
          updated_at?: string
          view_count?: number | null
          warranty_months?: number | null
          warranty_provider?: string | null
          whatsapp_phone: string
        }
        Update: {
          accepts_part_payment?: boolean | null
          accepts_trades?: boolean
          archived_at?: string | null
          attributes?: Json | null
          availability_checkin_at?: string | null
          availability_confirmed_at?: string | null
          brand?: string | null
          can_try?: boolean
          category?: string
          city?: string
          condition?: string | null
          contact_name?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by_source?: string
          delivery_pickup?: boolean
          description?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_source?: string | null
          id?: string
          installments_max?: number | null
          instrument_type?: string | null
          lima_delivery?: string | null
          listing_flags?: string[]
          marketplace_rules_accepted_at?: string | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          pickup_area?: string | null
          previous_price_pen?: number | null
          price_changed_at?: string | null
          price_dropped_at?: string | null
          price_mode?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string
          rejection_codes?: string[] | null
          rejection_reason?: string | null
          relisted_from_listing_id?: string | null
          restock_expected_on?: string | null
          returns_days?: number | null
          returns_note?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"]
          shipping_carriers?: string[]
          shipping_payment?: string | null
          ships_provinces?: boolean
          slug?: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          stock_state?: string | null
          store_id?: string | null
          store_terms_source?: string | null
          title?: string
          trade_categories?: string[]
          trade_wants?: string | null
          updated_at?: string
          view_count?: number | null
          warranty_months?: number | null
          warranty_provider?: string | null
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
            foreignKeyName: "listings_relisted_from_listing_id_fkey"
            columns: ["relisted_from_listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
            foreignKeyName: "marketplace_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
          service_id: string | null
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
          service_id?: string | null
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
          service_id?: string | null
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
            foreignKeyName: "notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
            foreignKeyName: "notifications_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
        Relationships: [
          {
            foreignKeyName: "purchase_checkins_buyer_user_id_fkey"
            columns: ["buyer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_checkins_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "transaction_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_checkins_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_checkins_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_checkins_seller_user_id_fkey"
            columns: ["seller_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_checkins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          listing_id: string | null
          question_id: string | null
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
          question_id?: string | null
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
          question_id?: string | null
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
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "listing_questions"
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
          name?: string | null
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
      search_synonyms: {
        Row: {
          expansions: string[]
          term: string
        }
        Insert: {
          expansions: string[]
          term: string
        }
        Update: {
          expansions?: string[]
          term?: string
        }
        Relationships: []
      }
      seller_bundle_offers: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          min_items: number
          owner_user_id: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          id?: string
          min_items?: number
          owner_user_id?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          min_items?: number
          owner_user_id?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_bundle_offers_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_bundle_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_levels: {
        Row: {
          computed_at: string
          facts: Json
          id: string
          qualified_since: string | null
          subject_store_id: string | null
          subject_user_id: string | null
        }
        Insert: {
          computed_at?: string
          facts?: Json
          id?: string
          qualified_since?: string | null
          subject_store_id?: string | null
          subject_user_id?: string | null
        }
        Update: {
          computed_at?: string
          facts?: Json
          id?: string
          qualified_since?: string | null
          subject_store_id?: string | null
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_levels_subject_store_id_fkey"
            columns: ["subject_store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_levels_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_pages: {
        Row: {
          created_at: string
          hidden: boolean
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_pages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bookings: {
        Row: {
          client_user_id: string
          confirmed_at: string | null
          created_at: string
          id: string
          provider_user_id: string
          requested_by: string
          responded_at: string | null
          review_deadline: string | null
          service_id: string
          status: string
        }
        Insert: {
          client_user_id: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          provider_user_id: string
          requested_by: string
          responded_at?: string | null
          review_deadline?: string | null
          service_id: string
          status?: string
        }
        Update: {
          client_user_id?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          provider_user_id?: string
          requested_by?: string
          responded_at?: string | null
          review_deadline?: string | null
          service_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_bookings_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_provider_user_id_fkey"
            columns: ["provider_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          kind: string
          service_id: string
          session_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id: string
          kind: string
          service_id: string
          session_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          service_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_user_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          service_id: string
          status: string
          target_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_user_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          service_id: string
          status?: string
          target_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          service_id?: string
          status?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "service_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reviews: {
        Row: {
          booking_id: string
          client_user_id: string
          comment: string | null
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          rating: number
          service_id: string
          status: string
        }
        Insert: {
          booking_id: string
          client_user_id: string
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          rating: number
          service_id: string
          status?: string
        }
        Update: {
          booking_id?: string
          client_user_id?: string
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          rating?: number
          service_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          approved_at: string | null
          areas: string[]
          category: string
          city: string
          created_at: string
          description: string
          district: string | null
          id: string
          modalities: string[]
          moderation_reason: string | null
          needs_recheck: boolean
          owner_user_id: string
          photo_paths: string[]
          price_from_pen: number
          price_unit: string
          provider_name: string
          region: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          skills: string[]
          slug: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
          version: number
          whatsapp_phone: string
        }
        Insert: {
          approved_at?: string | null
          areas?: string[]
          category: string
          city: string
          created_at?: string
          description: string
          district?: string | null
          id?: string
          modalities: string[]
          moderation_reason?: string | null
          needs_recheck?: boolean
          owner_user_id: string
          photo_paths?: string[]
          price_from_pen: number
          price_unit: string
          provider_name: string
          region?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          skills?: string[]
          slug: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
          version?: number
          whatsapp_phone: string
        }
        Update: {
          approved_at?: string | null
          areas?: string[]
          category?: string
          city?: string
          created_at?: string
          description?: string
          district?: string | null
          id?: string
          modalities?: string[]
          moderation_reason?: string | null
          needs_recheck?: boolean
          owner_user_id?: string
          photo_paths?: string[]
          price_from_pen?: number
          price_unit?: string
          provider_name?: string
          region?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          skills?: string[]
          slug?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
          version?: number
          whatsapp_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stolen_gear_report_photos: {
        Row: {
          created_at: string
          dhash: unknown
          id: string
          report_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          dhash?: unknown
          id?: string
          report_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          dhash?: unknown
          id?: string
          report_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "stolen_gear_report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "stolen_gear_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      stolen_gear_reports: {
        Row: {
          brand: string
          code: string
          created_at: string
          description: string
          id: string
          model: string | null
          place: string
          police_report: string
          police_station: string | null
          reporter_id: string
          serial_norm: string | null
          serial_raw: string | null
          status: string
          status_reason: string | null
          stolen_on: string
          updated_at: string
        }
        Insert: {
          brand: string
          code: string
          created_at?: string
          description: string
          id?: string
          model?: string | null
          place: string
          police_report: string
          police_station?: string | null
          reporter_id: string
          serial_norm?: string | null
          serial_raw?: string | null
          status?: string
          status_reason?: string | null
          stolen_on: string
          updated_at?: string
        }
        Update: {
          brand?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          model?: string | null
          place?: string
          police_report?: string
          police_station?: string | null
          reporter_id?: string
          serial_norm?: string | null
          serial_raw?: string | null
          status?: string
          status_reason?: string | null
          stolen_on?: string
          updated_at?: string
        }
        Relationships: []
      }
      stolen_report_matches: {
        Row: {
          admin_note: string | null
          created_at: string
          detail: Json
          id: string
          inventory_item_id: string | null
          listing_id: string | null
          ref_id: string
          report_id: string
          reporter_notified_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          detail?: Json
          id?: string
          inventory_item_id?: string | null
          listing_id?: string | null
          ref_id: string
          report_id: string
          reporter_notified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          detail?: Json
          id?: string
          inventory_item_id?: string | null
          listing_id?: string | null
          ref_id?: string
          report_id?: string
          reporter_notified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stolen_report_matches_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stolen_report_matches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stolen_report_matches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stolen_report_matches_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "stolen_gear_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      store_admin_requests: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          message: string | null
          requested_allowance: number | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          message?: string | null
          requested_allowance?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          message?: string | null
          requested_allowance?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_admin_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_counter_sale_movements: {
        Row: {
          movement_id: string
          sale_id: string
        }
        Insert: {
          movement_id: string
          sale_id: string
        }
        Update: {
          movement_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_counter_sale_movements_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: true
            referencedRelation: "store_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_counter_sale_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "store_counter_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      store_counter_sales: {
        Row: {
          cancelled_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          lines: Json
          sale_key: string
          status: string
          store_id: string
          token_hash: string
        }
        Insert: {
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          lines: Json
          sale_key: string
          status?: string
          store_id: string
          token_hash: string
        }
        Update: {
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          lines?: Json
          sale_key?: string
          status?: string
          store_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_counter_sales_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_counter_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_counter_sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_dealer_authorizations: {
        Row: {
          brand: string
          brand_key: string
          created_at: string
          created_by: string
          document_bytes: number
          document_checked_at: string | null
          document_name: string
          document_path: string
          document_sha256: string | null
          document_type: string
          id: string
          owner_note: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          status: string
          store_id: string
          submitted_at: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          brand: string
          brand_key: string
          created_at?: string
          created_by: string
          document_bytes: number
          document_checked_at?: string | null
          document_name: string
          document_path: string
          document_sha256?: string | null
          document_type: string
          id?: string
          owner_note?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          store_id: string
          submitted_at?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          brand?: string
          brand_key?: string
          created_at?: string
          created_by?: string
          document_bytes?: number
          document_checked_at?: string | null
          document_name?: string
          document_path?: string
          document_sha256?: string | null
          document_type?: string
          id?: string
          owner_note?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          store_id?: string
          submitted_at?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_dealer_authorizations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_einvoice_settings: {
        Row: {
          api_url: string
          boleta_series: string
          checked_at: string | null
          connected_at: string
          email_customer: boolean
          factura_series: string
          igv_affectation: string
          next_boleta_number: number
          next_factura_number: number
          provider: string
          store_id: string
          token_ciphertext: string
          token_hint: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_url: string
          boleta_series?: string
          checked_at?: string | null
          connected_at?: string
          email_customer?: boolean
          factura_series?: string
          igv_affectation?: string
          next_boleta_number?: number
          next_factura_number?: number
          provider?: string
          store_id: string
          token_ciphertext: string
          token_hint: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_url?: string
          boleta_series?: string
          checked_at?: string | null
          connected_at?: string
          email_customer?: boolean
          factura_series?: string
          igv_affectation?: string
          next_boleta_number?: number
          next_factura_number?: number
          provider?: string
          store_id?: string
          token_ciphertext?: string
          token_hint?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_einvoice_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_feed_settings: {
        Row: {
          enabled: boolean
          enabled_at: string | null
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string | null
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_feed_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_gift_policies: {
        Row: {
          exchange_days: number
          note: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          exchange_days: number
          note?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          exchange_days?: number
          note?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_gift_policies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_import_photo_assets: {
        Row: {
          bytes: number | null
          claim_source: string
          claimed_sequence: number | null
          claimed_sku: string | null
          claimed_sku_normalized: string | null
          created_at: string
          created_by: string
          declared_bytes: number
          delete_claimed_at: string | null
          deleted_at: string | null
          discarded_at: string | null
          duplicate_of: string | null
          file_ext: string
          height: number | null
          id: string
          match_issue: string | null
          match_note: string | null
          match_source: string | null
          mime_type: string | null
          object_path: string
          original_name: string
          placement: string
          reference_checked_at: string | null
          reject_code: string | null
          request_order: number
          session_id: string
          sha256: string | null
          status: string
          store_id: string
          target_row_number: number | null
          updated_at: string
          validated_at: string | null
          width: number | null
        }
        Insert: {
          bytes?: number | null
          claim_source: string
          claimed_sequence?: number | null
          claimed_sku?: string | null
          claimed_sku_normalized?: string | null
          created_at?: string
          created_by: string
          declared_bytes: number
          delete_claimed_at?: string | null
          deleted_at?: string | null
          discarded_at?: string | null
          duplicate_of?: string | null
          file_ext: string
          height?: number | null
          id?: string
          match_issue?: string | null
          match_note?: string | null
          match_source?: string | null
          mime_type?: string | null
          object_path: string
          original_name: string
          placement?: string
          reference_checked_at?: string | null
          reject_code?: string | null
          request_order?: never
          session_id: string
          sha256?: string | null
          status?: string
          store_id: string
          target_row_number?: number | null
          updated_at?: string
          validated_at?: string | null
          width?: number | null
        }
        Update: {
          bytes?: number | null
          claim_source?: string
          claimed_sequence?: number | null
          claimed_sku?: string | null
          claimed_sku_normalized?: string | null
          created_at?: string
          created_by?: string
          declared_bytes?: number
          delete_claimed_at?: string | null
          deleted_at?: string | null
          discarded_at?: string | null
          duplicate_of?: string | null
          file_ext?: string
          height?: number | null
          id?: string
          match_issue?: string | null
          match_note?: string | null
          match_source?: string | null
          mime_type?: string | null
          object_path?: string
          original_name?: string
          placement?: string
          reference_checked_at?: string | null
          reject_code?: string | null
          request_order?: never
          session_id?: string
          sha256?: string | null
          status?: string
          store_id?: string
          target_row_number?: number | null
          updated_at?: string
          validated_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "store_import_photo_assets_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "store_import_photo_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_import_photo_assets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "store_import_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_import_photo_assets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_import_photo_assignments: {
        Row: {
          asset_id: string
          created_at: string
          row_number: number
          session_id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          row_number: number
          session_id: string
          sort_order: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          row_number?: number
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_import_photo_assignments_asset_id_session_id_fkey"
            columns: ["asset_id", "session_id"]
            isOneToOne: false
            referencedRelation: "store_import_photo_assets"
            referencedColumns: ["id", "session_id"]
          },
          {
            foreignKeyName: "store_import_photo_assignments_session_id_row_number_fkey"
            columns: ["session_id", "row_number"]
            isOneToOne: false
            referencedRelation: "store_import_rows"
            referencedColumns: ["session_id", "row_number"]
          },
        ]
      }
      store_import_rows: {
        Row: {
          applied_at: string | null
          applied_item_id: string | null
          applied_movement_id: string | null
          catalog: Json | null
          changes: Json | null
          commit_message: string | null
          commit_status: string
          issues: Json
          owner_decision: string
          parsed: Json | null
          payload_fingerprint: string | null
          photo_count: number
          photo_state: string | null
          planned_action: string | null
          publish_fields: Json | null
          publish_message: string | null
          publish_status: string | null
          published_at: string | null
          published_listing_id: string | null
          raw: Json
          row_number: number
          session_id: string
          sku_normalized: string | null
          store_id: string
          target_item_id: string | null
          target_item_version: number | null
          target_listing_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_item_id?: string | null
          applied_movement_id?: string | null
          catalog?: Json | null
          changes?: Json | null
          commit_message?: string | null
          commit_status?: string
          issues?: Json
          owner_decision?: string
          parsed?: Json | null
          payload_fingerprint?: string | null
          photo_count?: number
          photo_state?: string | null
          planned_action?: string | null
          publish_fields?: Json | null
          publish_message?: string | null
          publish_status?: string | null
          published_at?: string | null
          published_listing_id?: string | null
          raw: Json
          row_number: number
          session_id: string
          sku_normalized?: string | null
          store_id: string
          target_item_id?: string | null
          target_item_version?: number | null
          target_listing_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_item_id?: string | null
          applied_movement_id?: string | null
          catalog?: Json | null
          changes?: Json | null
          commit_message?: string | null
          commit_status?: string
          issues?: Json
          owner_decision?: string
          parsed?: Json | null
          payload_fingerprint?: string | null
          photo_count?: number
          photo_state?: string | null
          planned_action?: string | null
          publish_fields?: Json | null
          publish_message?: string | null
          publish_status?: string | null
          published_at?: string | null
          published_listing_id?: string | null
          raw?: Json
          row_number?: number
          session_id?: string
          sku_normalized?: string | null
          store_id?: string
          target_item_id?: string | null
          target_item_version?: number | null
          target_listing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_import_rows_published_listing_id_fkey"
            columns: ["published_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_import_rows_published_listing_id_fkey"
            columns: ["published_listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_import_rows_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "store_import_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_import_rows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_import_sessions: {
        Row: {
          cancelled_at: string | null
          closed_at: string | null
          column_mapping: Json | null
          commit_started_at: string | null
          committed_at: string | null
          counts: Json
          created_at: string
          created_by: string
          error_code: string | null
          error_message: string | null
          file_bytes: number
          file_format: string
          file_name: string
          file_path: string
          file_sha256: string | null
          file_warnings: Json
          header_row: number | null
          headers: Json | null
          id: string
          lock_token: string | null
          locked_until: string | null
          mapping_confirmed_at: string | null
          mode: string
          options: Json
          parse_cursor: number
          photo_counts: Json
          proposed_mapping: Json | null
          publish_counts: Json
          result_summary: Json | null
          row_count: number | null
          rows_purged_at: string | null
          sheet_name: string | null
          status: string
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          cancelled_at?: string | null
          closed_at?: string | null
          column_mapping?: Json | null
          commit_started_at?: string | null
          committed_at?: string | null
          counts?: Json
          created_at?: string
          created_by: string
          error_code?: string | null
          error_message?: string | null
          file_bytes: number
          file_format: string
          file_name: string
          file_path: string
          file_sha256?: string | null
          file_warnings?: Json
          header_row?: number | null
          headers?: Json | null
          id?: string
          lock_token?: string | null
          locked_until?: string | null
          mapping_confirmed_at?: string | null
          mode?: string
          options?: Json
          parse_cursor?: number
          photo_counts?: Json
          proposed_mapping?: Json | null
          publish_counts?: Json
          result_summary?: Json | null
          row_count?: number | null
          rows_purged_at?: string | null
          sheet_name?: string | null
          status?: string
          store_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          cancelled_at?: string | null
          closed_at?: string | null
          column_mapping?: Json | null
          commit_started_at?: string | null
          committed_at?: string | null
          counts?: Json
          created_at?: string
          created_by?: string
          error_code?: string | null
          error_message?: string | null
          file_bytes?: number
          file_format?: string
          file_name?: string
          file_path?: string
          file_sha256?: string | null
          file_warnings?: Json
          header_row?: number | null
          headers?: Json | null
          id?: string
          lock_token?: string | null
          locked_until?: string | null
          mapping_confirmed_at?: string | null
          mode?: string
          options?: Json
          parse_cursor?: number
          photo_counts?: Json
          proposed_mapping?: Json | null
          publish_counts?: Json
          result_summary?: Json | null
          row_count?: number | null
          rows_purged_at?: string | null
          sheet_name?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_import_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_installment_offer_changes: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          after: Json
          before: Json | null
          change_type: string
          created_at: string
          id: string
          reason: string | null
          store_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          after: Json
          before?: Json | null
          change_type: string
          created_at?: string
          id?: string
          reason?: string | null
          store_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          after?: Json
          before?: Json | null
          change_type?: string
          created_at?: string
          id?: string
          reason?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_installment_offer_changes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_installment_offers: {
        Row: {
          cards: string[]
          created_at: string
          max_installments: number
          min_price_pen: number | null
          owner_note: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          cards?: string[]
          created_at?: string
          max_installments: number
          min_price_pen?: number | null
          owner_note?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          cards?: string[]
          created_at?: string
          max_installments?: number
          min_price_pen?: number | null
          owner_note?: string | null
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
            foreignKeyName: "store_installment_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory_changes: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          after: Json
          before: Json
          change_type: string
          created_at: string
          id: string
          item_id: string
          reason: string | null
          store_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          after?: Json
          before?: Json
          change_type: string
          created_at?: string
          id?: string
          item_id: string
          reason?: string | null
          store_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          after?: Json
          before?: Json
          change_type?: string
          created_at?: string
          id?: string
          item_id?: string
          reason?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_changes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_changes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory_items: {
        Row: {
          catalog_product_id: string | null
          catalog_variant_id: string | null
          category: string | null
          created_at: string
          expected_arrival_on: string | null
          external_reference: string | null
          id: string
          inventory_status: Database["public"]["Enums"]["inventory_status"]
          last_movement_at: string | null
          listing_details: Json
          listing_id: string | null
          low_stock_threshold: number | null
          merchant_sku: string
          product_name: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          sku_generated: boolean
          sku_normalized: string
          stock_source: Database["public"]["Enums"]["stock_source"]
          store_id: string
          unit_price_pen: number | null
          updated_at: string
          variant_label: string | null
          version: number
        }
        Insert: {
          catalog_product_id?: string | null
          catalog_variant_id?: string | null
          category?: string | null
          created_at?: string
          expected_arrival_on?: string | null
          external_reference?: string | null
          id?: string
          inventory_status?: Database["public"]["Enums"]["inventory_status"]
          last_movement_at?: string | null
          listing_details?: Json
          listing_id?: string | null
          low_stock_threshold?: number | null
          merchant_sku: string
          product_name: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sku_generated?: boolean
          sku_normalized: string
          stock_source?: Database["public"]["Enums"]["stock_source"]
          store_id: string
          unit_price_pen?: number | null
          updated_at?: string
          variant_label?: string | null
          version?: number
        }
        Update: {
          catalog_product_id?: string | null
          catalog_variant_id?: string | null
          category?: string | null
          created_at?: string
          expected_arrival_on?: string | null
          external_reference?: string | null
          id?: string
          inventory_status?: Database["public"]["Enums"]["inventory_status"]
          last_movement_at?: string | null
          listing_details?: Json
          listing_id?: string | null
          low_stock_threshold?: number | null
          merchant_sku?: string
          product_name?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          sku_generated?: boolean
          sku_normalized?: string
          stock_source?: Database["public"]["Enums"]["stock_source"]
          store_id?: string
          unit_price_pen?: number | null
          updated_at?: string
          variant_label?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_listing_same_store"
            columns: ["listing_id", "store_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "inventory_listing_same_store"
            columns: ["listing_id", "store_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "store_inventory_items_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory_preferences: {
        Row: {
          daily_stock_summary: boolean
          default_low_stock_threshold: number | null
          pickup_hours: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          daily_stock_summary?: boolean
          default_low_stock_threshold?: number | null
          pickup_hours?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          daily_stock_summary?: boolean
          default_low_stock_threshold?: number | null
          pickup_hours?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          store_id: string
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          name: string
          store_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_views_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_listing_defaults: {
        Row: {
          condition: string | null
          description_footer: string
          store_id: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          description_footer?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          description_footer?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listing_defaults_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_location_stock: {
        Row: {
          item_id: string
          location_id: string
          quantity_on_hand: number
          store_id: string
          updated_at: string
        }
        Insert: {
          item_id: string
          location_id: string
          quantity_on_hand?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          item_id?: string
          location_id?: string
          quantity_on_hand?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_location_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_location_stock_location"
            columns: ["location_id", "store_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      store_locations: {
        Row: {
          address: string | null
          archived_at: string | null
          city: string
          created_at: string
          district: string | null
          id: string
          is_primary: boolean
          name: string
          opening_hours: string | null
          pickup_enabled: boolean
          position: number
          public_address: string | null
          region: string
          show_address: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          city: string
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          name: string
          opening_hours?: string | null
          pickup_enabled?: boolean
          position?: number
          public_address?: string | null
          region: string
          show_address?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          city?: string
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          opening_hours?: string | null
          pickup_enabled?: boolean
          position?: number
          public_address?: string | null
          region?: string
          show_address?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_locations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_maker_profiles: {
        Row: {
          craft_city: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          kind: string
          since_year: number | null
          store_id: string
          story: string | null
          updated_at: string
        }
        Insert: {
          craft_city: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          kind: string
          since_year?: number | null
          store_id: string
          story?: string | null
          updated_at?: string
        }
        Update: {
          craft_city?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          kind?: string
          since_year?: number | null
          store_id?: string
          story?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_maker_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
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
      store_mercadolibre_connections: {
        Row: {
          access_token_enc: string
          connected_at: string
          connected_by: string
          expires_at: string
          ml_nickname: string | null
          ml_user_id: number
          refresh_token_enc: string | null
          scope: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          connected_at?: string
          connected_by: string
          expires_at: string
          ml_nickname?: string | null
          ml_user_id: number
          refresh_token_enc?: string | null
          scope?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          connected_at?: string
          connected_by?: string
          expires_at?: string
          ml_nickname?: string | null
          ml_user_id?: number
          refresh_token_enc?: string | null
          scope?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_mercadolibre_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_mercadolibre_import_photos: {
        Row: {
          asset_id: string | null
          claimed_at: string | null
          created_at: string
          failure: string | null
          id: string
          session_id: string
          sku: string
          sort_order: number
          source_url: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          claimed_at?: string | null
          created_at?: string
          failure?: string | null
          id?: string
          session_id: string
          sku: string
          sort_order: number
          source_url: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          claimed_at?: string | null
          created_at?: string
          failure?: string | null
          id?: string
          session_id?: string
          sku?: string
          sort_order?: number
          source_url?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_mercadolibre_import_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "store_import_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_mercadolibre_import_photos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_operation_settings: {
        Row: {
          import_mapping_default: Json | null
          inventory_enabled: boolean
          listing_allowance: number
          next_generated_sku: number
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          import_mapping_default?: Json | null
          inventory_enabled?: boolean
          listing_allowance?: number
          next_generated_sku?: number
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          import_mapping_default?: Json | null
          inventory_enabled?: boolean
          listing_allowance?: number
          next_generated_sku?: number
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_operation_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_payment_method_changes: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          after: Json
          before: Json | null
          change_type: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["store_payment_method"]
          reason: string | null
          store_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          after: Json
          before?: Json | null
          change_type: string
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["store_payment_method"]
          reason?: string | null
          store_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          after?: Json
          before?: Json | null
          change_type?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["store_payment_method"]
          reason?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_payment_method_changes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
      store_price_campaigns: {
        Row: {
          batch_key: string
          changes: Json
          created_at: string
          created_by: string | null
          id: string
          item_count: number
          mode: string
          name: string
          revert_result: Json | null
          reverted_at: string | null
          reverted_by: string | null
          rounding: string
          store_id: string
          value: number
        }
        Insert: {
          batch_key: string
          changes: Json
          created_at?: string
          created_by?: string | null
          id?: string
          item_count: number
          mode: string
          name: string
          revert_result?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          rounding?: string
          store_id: string
          value: number
        }
        Update: {
          batch_key?: string
          changes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          item_count?: number
          mode?: string
          name?: string
          revert_result?: Json | null
          reverted_at?: string | null
          reverted_by?: string | null
          rounding?: string
          store_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_price_campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_purchase_request_marks: {
        Row: {
          event_id: string
          marked_at: string
          marked_by: string | null
          quantity: number | null
          sale_movement_id: string | null
          status: string
          store_id: string
        }
        Insert: {
          event_id: string
          marked_at?: string
          marked_by?: string | null
          quantity?: number | null
          sale_movement_id?: string | null
          status: string
          store_id: string
        }
        Update: {
          event_id?: string
          marked_at?: string
          marked_by?: string | null
          quantity?: number | null
          sale_movement_id?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchase_request_marks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "marketplace_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchase_request_marks_sale_movement_id_fkey"
            columns: ["sale_movement_id"]
            isOneToOne: false
            referencedRelation: "store_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchase_request_marks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_receipts: {
        Row: {
          attempts: number
          cdr_url: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_doc_number: string | null
          customer_doc_type: string
          customer_email: string | null
          customer_name: string | null
          error_message: string | null
          id: string
          igv_affectation: string
          issue_date: string
          kind: string
          lines: Json
          location_id: string | null
          number: number
          pdf_url: string | null
          provider_link: string | null
          sale_key: string
          series: string
          status: string
          store_id: string
          sunat_accepted: boolean | null
          sunat_description: string | null
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          xml_url: string | null
        }
        Insert: {
          attempts?: number
          cdr_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_doc_number?: string | null
          customer_doc_type: string
          customer_email?: string | null
          customer_name?: string | null
          error_message?: string | null
          id?: string
          igv_affectation: string
          issue_date: string
          kind: string
          lines: Json
          location_id?: string | null
          number: number
          pdf_url?: string | null
          provider_link?: string | null
          sale_key: string
          series: string
          status?: string
          store_id: string
          sunat_accepted?: boolean | null
          sunat_description?: string | null
          total_cents: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          xml_url?: string | null
        }
        Update: {
          attempts?: number
          cdr_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_doc_number?: string | null
          customer_doc_type?: string
          customer_email?: string | null
          customer_name?: string | null
          error_message?: string | null
          id?: string
          igv_affectation?: string
          issue_date?: string
          kind?: string
          lines?: Json
          location_id?: string | null
          number?: number
          pdf_url?: string | null
          provider_link?: string | null
          sale_key?: string
          series?: string
          status?: string
          store_id?: string
          sunat_accepted?: boolean | null
          sunat_description?: string | null
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_safe_spots: {
        Row: {
          admin_disabled_at: string | null
          admin_disabled_by: string | null
          admin_disabled_reason: string | null
          enabled: boolean
          enabled_at: string | null
          note: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          admin_disabled_at?: string | null
          admin_disabled_by?: string | null
          admin_disabled_reason?: string | null
          enabled?: boolean
          enabled_at?: string | null
          note?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          admin_disabled_at?: string | null
          admin_disabled_by?: string | null
          admin_disabled_reason?: string | null
          enabled?: boolean
          enabled_at?: string | null
          note?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_safe_spots_admin_disabled_by_fkey"
            columns: ["admin_disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_safe_spots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_stock_movements: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          channel: Database["public"]["Enums"]["stock_channel"]
          corrects_movement_id: string | null
          created_at: string
          external_event_ref: string | null
          id: string
          idempotency_key: string
          import_row_number: number | null
          import_session_id: string | null
          item_id: string
          item_version_after: number
          location_id: string | null
          location_split: Json | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          on_hand_after: number
          on_hand_before: number
          on_hand_delta: number
          reason: string | null
          reference: string | null
          request_fingerprint: string
          reserved_after: number
          reserved_before: number
          reserved_delta: number
          store_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          channel: Database["public"]["Enums"]["stock_channel"]
          corrects_movement_id?: string | null
          created_at?: string
          external_event_ref?: string | null
          id?: string
          idempotency_key: string
          import_row_number?: number | null
          import_session_id?: string | null
          item_id: string
          item_version_after: number
          location_id?: string | null
          location_split?: Json | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          on_hand_after: number
          on_hand_before: number
          on_hand_delta: number
          reason?: string | null
          reference?: string | null
          request_fingerprint: string
          reserved_after: number
          reserved_before: number
          reserved_delta?: number
          store_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          channel?: Database["public"]["Enums"]["stock_channel"]
          corrects_movement_id?: string | null
          created_at?: string
          external_event_ref?: string | null
          id?: string
          idempotency_key?: string
          import_row_number?: number | null
          import_session_id?: string | null
          item_id?: string
          item_version_after?: number
          location_id?: string | null
          location_split?: Json | null
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          on_hand_after?: number
          on_hand_before?: number
          on_hand_delta?: number
          reason?: string | null
          reference?: string | null
          request_fingerprint?: string
          reserved_after?: number
          reserved_before?: number
          reserved_delta?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_stock_movements_corrects_movement_id_fkey"
            columns: ["corrects_movement_id"]
            isOneToOne: false
            referencedRelation: "store_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_movements_import_session_fk"
            columns: ["import_session_id"]
            isOneToOne: false
            referencedRelation: "store_import_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_stock_transfers: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          from_location_id: string
          id: string
          idempotency_key: string
          item_id: string
          quantity: number
          reason: string | null
          request_fingerprint: string
          store_id: string
          to_location_id: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          from_location_id: string
          id?: string
          idempotency_key: string
          item_id: string
          quantity: number
          reason?: string | null
          request_fingerprint: string
          store_id: string
          to_location_id: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          from_location_id?: string
          id?: string
          idempotency_key?: string
          item_id?: string
          quantity?: number
          reason?: string | null
          request_fingerprint?: string
          store_id?: string
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_transfers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "store_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_transfers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_trade_settings: {
        Row: {
          buy_categories: string[]
          buys_used: boolean
          consignment: boolean
          consumables: string[]
          note: string | null
          part_payment: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          buy_categories?: string[]
          buys_used?: boolean
          consignment?: boolean
          consumables?: string[]
          note?: string | null
          part_payment?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          buy_categories?: string[]
          buys_used?: boolean
          consignment?: boolean
          consumables?: string[]
          note?: string | null
          part_payment?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_trade_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_tryout_settings: {
        Row: {
          capacity: number
          enabled: boolean
          max_days_ahead: number
          min_notice_hours: number
          note: string | null
          slot_minutes: number
          store_id: string
          updated_at: string
          weekly_hours: Json
        }
        Insert: {
          capacity?: number
          enabled?: boolean
          max_days_ahead?: number
          min_notice_hours?: number
          note?: string | null
          slot_minutes?: number
          store_id: string
          updated_at?: string
          weekly_hours?: Json
        }
        Update: {
          capacity?: number
          enabled?: boolean
          max_days_ahead?: number
          min_notice_hours?: number
          note?: string | null
          slot_minutes?: number
          store_id?: string
          updated_at?: string
          weekly_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "store_tryout_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_tryouts: {
        Row: {
          buyer_name: string
          buyer_note: string | null
          buyer_phone: string
          buyer_user_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          ends_at: string
          id: string
          listing_id: string | null
          listing_title: string
          reminded_at: string | null
          request_key: string
          starts_at: string
          status: string
          store_id: string
          store_reason: string | null
        }
        Insert: {
          buyer_name: string
          buyer_note?: string | null
          buyer_phone: string
          buyer_user_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          ends_at: string
          id?: string
          listing_id?: string | null
          listing_title: string
          reminded_at?: string | null
          request_key: string
          starts_at: string
          status?: string
          store_id: string
          store_reason?: string | null
        }
        Update: {
          buyer_name?: string
          buyer_note?: string | null
          buyer_phone?: string
          buyer_user_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          ends_at?: string
          id?: string
          listing_id?: string | null
          listing_title?: string
          reminded_at?: string | null
          request_key?: string
          starts_at?: string
          status?: string
          store_id?: string
          store_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_tryouts_buyer_user_id_fkey"
            columns: ["buyer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tryouts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tryouts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_tryouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_warranty_policies: {
        Row: {
          condition_group: string
          returns_days: number | null
          returns_note: string | null
          store_id: string
          updated_at: string
          updated_by: string | null
          warranty_months: number | null
          warranty_provider: string | null
        }
        Insert: {
          condition_group: string
          returns_days?: number | null
          returns_note?: string | null
          store_id: string
          updated_at?: string
          updated_by?: string | null
          warranty_months?: number | null
          warranty_provider?: string | null
        }
        Update: {
          condition_group?: string
          returns_days?: number | null
          returns_note?: string | null
          store_id?: string
          updated_at?: string
          updated_by?: string | null
          warranty_months?: number | null
          warranty_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_warranty_policies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_warranty_policies_updated_by_fkey"
            columns: ["updated_by"]
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
          map_latitude: number | null
          map_longitude: number | null
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
          public_map_latitude: number | null
          public_map_longitude: number | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          verification_lapsed_at: string | null
          verification_lapsed_from: Json | null
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
          map_latitude?: number | null
          map_longitude?: number | null
          name: string
          opening_hours?: string | null
          owner_user_id?: string | null
          public_address?: string | null
          public_map_latitude?: number | null
          public_map_longitude?: number | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          show_address?: boolean
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          tiktok_url?: string | null
          updated_at?: string
          verification_lapsed_at?: string | null
          verification_lapsed_from?: Json | null
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
          map_latitude?: number | null
          map_longitude?: number | null
          name?: string
          opening_hours?: string | null
          owner_user_id?: string | null
          public_address?: string | null
          public_map_latitude?: number | null
          public_map_longitude?: number | null
          razon_social?: string | null
          region?: string
          rejection_reason?: string | null
          ruc?: string | null
          show_address?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          tiktok_url?: string | null
          updated_at?: string
          verification_lapsed_at?: string | null
          verification_lapsed_from?: Json | null
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
      trade_offers: {
        Row: {
          amount_pen: number
          created_at: string
          id: string
          note: string | null
          request_id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount_pen: number
          created_at?: string
          id?: string
          note?: string | null
          request_id: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount_pen?: number
          created_at?: string
          id?: string
          note?: string | null
          request_id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "trade_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_requests: {
        Row: {
          accepted_at: string | null
          accepted_offer_id: string | null
          asking_price_pen: number | null
          brand: string
          category: string
          city: string | null
          close_reason: string | null
          closed_at: string | null
          condition: string
          contact_phone: string | null
          created_at: string
          decide_until: string
          description: string
          drop_off_by: string | null
          final_price_pen: number | null
          gear_item_id: string | null
          id: string
          instrument_type: string
          kind: string
          listing_id: string | null
          model: string
          offers_until: string
          photos: string[]
          region: string
          requester_user_id: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_offer_id?: string | null
          asking_price_pen?: number | null
          brand: string
          category: string
          city?: string | null
          close_reason?: string | null
          closed_at?: string | null
          condition: string
          contact_phone?: string | null
          created_at?: string
          decide_until: string
          description: string
          drop_off_by?: string | null
          final_price_pen?: number | null
          gear_item_id?: string | null
          id: string
          instrument_type: string
          kind: string
          listing_id?: string | null
          model?: string
          offers_until: string
          photos: string[]
          region: string
          requester_user_id: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_offer_id?: string | null
          asking_price_pen?: number | null
          brand?: string
          category?: string
          city?: string | null
          close_reason?: string | null
          closed_at?: string | null
          condition?: string
          contact_phone?: string | null
          created_at?: string
          decide_until?: string
          description?: string
          drop_off_by?: string | null
          final_price_pen?: number | null
          gear_item_id?: string | null
          id?: string
          instrument_type?: string
          kind?: string
          listing_id?: string | null
          model?: string
          offers_until?: string
          photos?: string[]
          region?: string
          requester_user_id?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_requests_accepted_offer_fkey"
            columns: ["accepted_offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_gear_item_id_fkey"
            columns: ["gear_item_id"]
            isOneToOne: false
            referencedRelation: "gear_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
            foreignKeyName: "transaction_claims_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listings"
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
      transaction_review_photos: {
        Row: {
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          review_id: string
          sort_order: number
          status: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          review_id: string
          sort_order: number
          status?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          review_id?: string
          sort_order?: number
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_review_photos_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_review_photos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "transaction_reviews"
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
          held_at: string | null
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
          held_at?: string | null
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
          held_at?: string | null
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
          claim_id: string | null
          counter_sale_id: string | null
          id: string
          listing_id: string | null
          review_deadline: string
          seller_identity_type: string
          seller_user_id: string
          sold_at: string
          store_id: string | null
          verified_at: string
        }
        Insert: {
          buyer_user_id: string
          claim_id?: string | null
          counter_sale_id?: string | null
          id?: string
          listing_id?: string | null
          review_deadline: string
          seller_identity_type: string
          seller_user_id: string
          sold_at: string
          store_id?: string | null
          verified_at?: string
        }
        Update: {
          buyer_user_id?: string
          claim_id?: string | null
          counter_sale_id?: string | null
          id?: string
          listing_id?: string | null
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
            foreignKeyName: "verified_transactions_counter_sale_id_fkey"
            columns: ["counter_sale_id"]
            isOneToOne: true
            referencedRelation: "store_counter_sales"
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
            foreignKeyName: "verified_transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listings"
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
      catalog_category_terms: {
        Row: {
          category_id: string | null
          term: string | null
        }
        Relationships: []
      }
      catalog_search_gaps: {
        Row: {
          example: string | null
          last_seen: string | null
          normalized_query: string | null
          searches: number | null
          tier: string | null
        }
        Relationships: []
      }
      public_listings: {
        Row: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean | null
          attributes: Json | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean | null
          category: string | null
          city: string | null
          condition: string | null
          content_changed_at: string | null
          created_at: string | null
          delivery_pickup: boolean | null
          description: string | null
          id: string | null
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[] | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"] | null
          shipping_carriers: string[] | null
          shipping_payment: string | null
          ships_provinces: boolean | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string | null
          trade_categories: string[] | null
          trade_wants: string | null
          updated_at: string | null
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          listing_photo_count: number | null
        }
        Insert: {
          accepts_part_payment?: boolean | null
          accepts_trades?: boolean | null
          attributes?: Json | null
          availability_confirmed_at?: string | null
          brand?: string | null
          can_try?: boolean | null
          category?: string | null
          city?: string | null
          condition?: string | null
          content_changed_at?: string | null
          created_at?: string | null
          delivery_pickup?: boolean | null
          description?: string | null
          id?: string | null
          installments_max?: number | null
          instrument_type?: string | null
          lima_delivery?: string | null
          listing_flags?: string[] | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          pickup_area?: string | null
          previous_price_pen?: number | null
          price_dropped_at?: string | null
          price_mode?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string | null
          restock_expected_on?: string | null
          returns_days?: number | null
          returns_note?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"] | null
          shipping_carriers?: string[] | null
          shipping_payment?: string | null
          ships_provinces?: boolean | null
          slug?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          stock_state?: string | null
          store_id?: string | null
          store_terms_source?: string | null
          title?: string | null
          trade_categories?: string[] | null
          trade_wants?: string | null
          updated_at?: string | null
          view_count?: number | null
          warranty_months?: number | null
          warranty_provider?: string | null
        }
        Update: {
          accepts_part_payment?: boolean | null
          accepts_trades?: boolean | null
          attributes?: Json | null
          availability_confirmed_at?: string | null
          brand?: string | null
          can_try?: boolean | null
          category?: string | null
          city?: string | null
          condition?: string | null
          content_changed_at?: string | null
          created_at?: string | null
          delivery_pickup?: boolean | null
          description?: string | null
          id?: string | null
          installments_max?: number | null
          instrument_type?: string | null
          lima_delivery?: string | null
          listing_flags?: string[] | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          pickup_area?: string | null
          previous_price_pen?: number | null
          price_dropped_at?: string | null
          price_mode?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string | null
          restock_expected_on?: string | null
          returns_days?: number | null
          returns_note?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"] | null
          shipping_carriers?: string[] | null
          shipping_payment?: string | null
          ships_provinces?: boolean | null
          slug?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          stock_state?: string | null
          store_id?: string | null
          store_terms_source?: string | null
          title?: string | null
          trade_categories?: string[] | null
          trade_wants?: string | null
          updated_at?: string | null
          view_count?: number | null
          warranty_months?: number | null
          warranty_provider?: string | null
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
      accept_catalog_ai_proposals: {
        Args: { p_brand?: string }
        Returns: number
      }
      accept_consignment_invite: { Args: { p_token: string }; Returns: string }
      accept_trade_offer: {
        Args: { p_offer_id: string; p_phone?: string }
        Returns: Json
      }
      admin_anonymize_account: {
        Args: { p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_answer_help_ticket: {
        Args: { p_answer: string; p_close?: boolean; p_ticket_id: string }
        Returns: Json
      }
      admin_close_service_report: {
        Args: { p_note: string; p_report_id: string; p_status: string }
        Returns: Json
      }
      admin_close_store_request: {
        Args: { p_note?: string; p_request_id: string; p_status: string }
        Returns: Json
      }
      admin_delete_collection: { Args: { p_id: string }; Returns: Json }
      admin_get_campaign: { Args: { p_id: string }; Returns: Json }
      admin_get_campaigns: { Args: never; Returns: Json }
      admin_get_dealer_authorizations: {
        Args: { p_status?: string }
        Returns: Json
      }
      admin_get_dealer_document: { Args: { p_id: string }; Returns: Json }
      admin_get_listing: {
        Args: { p_listing_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_store: {
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
          map_latitude: number | null
          map_longitude: number | null
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
          public_map_latitude: number | null
          public_map_longitude: number | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          verification_lapsed_at: string | null
          verification_lapsed_from: Json | null
          website_url: string | null
          whatsapp_phone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_help_tickets: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      admin_listing_red_flags: {
        Args: { p_listing_ids: string[] }
        Returns: Json
      }
      admin_moderate_service_review: {
        Args: { p_action: string; p_reason: string; p_review_id: string }
        Returns: Json
      }
      admin_red_flags: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      admin_remove_campaign_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: Json
      }
      admin_review_dealer_authorization: {
        Args: {
          p_decision: string
          p_expected_revision: number
          p_id: string
          p_reason?: string
          p_valid_until?: string
        }
        Returns: Json
      }
      admin_review_red_flag: {
        Args: { p_flag_id: string; p_note?: string; p_status: string }
        Returns: string
      }
      admin_review_service: {
        Args: {
          p_decision: string
          p_expected_version?: number
          p_reason?: string
          p_service_id: string
        }
        Returns: Json
      }
      admin_review_stolen_match: {
        Args: { p_match_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      admin_review_store_installments: {
        Args: {
          p_decision: string
          p_expected_revision: number
          p_reason: string
          p_store_id: string
        }
        Returns: Json
      }
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
      admin_revoke_artist_profile: {
        Args: { p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_save_artist_profile: {
        Args: {
          p_check: string
          p_display_name: string
          p_email: string
          p_link_url: string
          p_slug: string
          p_story: string
        }
        Returns: Json
      }
      admin_save_campaign: {
        Args: {
          p_description: string
          p_ends_at: string
          p_expected_revision?: number
          p_id: string
          p_min_discount_pct: number
          p_name: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      admin_save_collection: {
        Args: {
          p_ends_on: string
          p_id: string
          p_intro: string
          p_published: boolean
          p_sets: Json
          p_slug: string
          p_sort_order?: number
          p_starts_on: string
          p_title: string
        }
        Returns: Json
      }
      admin_set_campaign_status: {
        Args: {
          p_expected_revision: number
          p_id: string
          p_reason?: string
          p_status: string
        }
        Returns: Json
      }
      admin_set_help_ticket_status: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: string
      }
      admin_set_maker_hidden: {
        Args: { p_hidden: boolean; p_reason: string; p_store_id: string }
        Returns: Json
      }
      admin_set_safe_spot: {
        Args: { p_allowed: boolean; p_reason?: string; p_store_id: string }
        Returns: Json
      }
      admin_set_stolen_report_status: {
        Args: { p_reason?: string; p_report_id: string; p_status: string }
        Returns: string
      }
      admin_set_store_inventory_enabled: {
        Args: { p_enabled: boolean; p_reason: string; p_store_id: string }
        Returns: Json
      }
      admin_set_store_listing_allowance: {
        Args: { p_allowance: number; p_reason: string; p_store_id: string }
        Returns: Json
      }
      admin_stolen_matches: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      admin_stolen_reports: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      answer_complaints_book_entry: {
        Args: { p_answer: string; p_entry_id: string }
        Returns: Json
      }
      answer_listing_question: {
        Args: { p_answer: string; p_question_id: string }
        Returns: Json
      }
      answer_purchase_checkin: {
        Args: { p_bought: boolean; p_listing_id: string }
        Returns: Json
      }
      apply_bulk_stock_operations: {
        Args: { p_batch_key: string; p_operations: Json }
        Returns: Json
      }
      apply_email_link_action: {
        Args: { p_action: string; p_alert_id?: string; p_user_id: string }
        Returns: boolean
      }
      apply_inventory_bulk_action: {
        Args: {
          p_action: string
          p_batch_key: string
          p_item_ids: string[]
          p_reason: string
          p_value: string
        }
        Returns: Json
      }
      apply_inventory_price_campaign: {
        Args: {
          p_batch_key: string
          p_item_ids: string[]
          p_mode: string
          p_name: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      apply_location_bulk_stock_operations: {
        Args: { p_batch_key: string; p_location_id: string; p_operations: Json }
        Returns: Json
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
      archive_inventory_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: Json
      }
      archive_store_location: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_move_to: string
        }
        Returns: Json
      }
      ask_listing_question: {
        Args: { p_body: string; p_listing_id: string }
        Returns: Json
      }
      attach_review_photos: {
        Args: { p_paths: string[]; p_review_id: string }
        Returns: Json
      }
      auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      begin_store_import_parse: {
        Args: {
          p_file_bytes: number
          p_file_sha256: string
          p_lock_token: string
          p_session_id: string
        }
        Returns: Json
      }
      can_add_listing_photo: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      can_manage_listing: { Args: { p_listing_id: string }; Returns: boolean }
      can_remove_listing_photo: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      can_view_trade_photo: { Args: { p_path: string }; Returns: boolean }
      cancel_counter_purchase_code: {
        Args: { p_sale_id: string }
        Returns: string
      }
      cancel_my_tryout: { Args: { p_tryout_id: string }; Returns: Json }
      cancel_private_offer: { Args: { p_offer_id: string }; Returns: boolean }
      cancel_service_booking: { Args: { p_booking_id: string }; Returns: Json }
      cancel_store_import: { Args: { p_session_id: string }; Returns: Json }
      cancel_transaction_claim: {
        Args: { p_claim_id: string }
        Returns: boolean
      }
      catalog_brand_counts: {
        Args: never
        Returns: {
          brand: string
          category: string
          listings: number
        }[]
      }
      catalog_compact: { Args: { input: string }; Returns: string }
      catalog_compact_normalized: { Args: { input: string }; Returns: string }
      catalog_facets: {
        Args: { p_attribute_keys?: string[]; p_filters: Json; p_q?: string }
        Returns: Json
      }
      catalog_fold: { Args: { input: string }; Returns: string }
      catalog_jev_inputs: {
        Args: { manufacturer_hint?: string; query: string }
        Returns: {
          brand_mentioned: boolean
          category_id: string
          decision: string
          detail_status: string
          detailed: boolean
          entity_level: string
          manufacturer: string
          match_type: string
          missing_attributes: string[]
          model: string
          product_id: string
          publish_ready: boolean
          reasons: string[]
          runner_up_product_id: string
          runner_up_score: number
          score: number
          tier: string
          untrusted_attributes: string[]
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
          warning: string
        }[]
      }
      catalog_lookup: {
        Args: {
          manufacturer_hint?: string
          max_results?: number
          query: string
        }
        Returns: {
          category_id: string
          category_intent: string
          category_label_es: string
          confidence: number
          discontinuation_year: number
          entity_level: string
          introduction_year: number
          manufacturer: string
          match_type: string
          matched_text: string
          model: string
          product_id: string
          publish_ready: boolean
          quality_status: string
          score: number
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
          warning: string
        }[]
      }
      catalog_lookup_candidates: {
        Args: {
          manufacturer_hint?: string
          max_results?: number
          query: string
        }
        Returns: {
          category_id: string
          category_intent: string
          category_label_es: string
          confidence: number
          discontinuation_year: number
          entity_level: string
          introduction_year: number
          manufacturer: string
          match_type: string
          matched_text: string
          model: string
          product_id: string
          publish_ready: boolean
          quality_status: string
          score: number
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
          warning: string
        }[]
      }
      catalog_match: {
        Args: { manufacturer_hint?: string; query: string }
        Returns: {
          brand_mentioned: boolean
          category_id: string
          category_intent: string
          category_label_es: string
          decision: string
          entity_level: string
          manufacturer: string
          match_type: string
          matched_text: string
          model: string
          product_id: string
          publish_ready: boolean
          quality_status: string
          reasons: string[]
          runner_up_product_id: string
          runner_up_score: number
          score: number
          tier: string
          verification_status: Database["public"]["Enums"]["catalog_verification_status"]
          warning: string
        }[]
      }
      catalog_normalize: { Args: { input: string }; Returns: string }
      catalog_redact: { Args: { input: string }; Returns: string }
      catalog_search: {
        Args: { p_q: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean | null
          attributes: Json | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean | null
          category: string | null
          city: string | null
          condition: string | null
          content_changed_at: string | null
          created_at: string | null
          delivery_pickup: boolean | null
          description: string | null
          id: string | null
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[] | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"] | null
          shipping_carriers: string[] | null
          shipping_payment: string | null
          ships_provinces: boolean | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string | null
          trade_categories: string[] | null
          trade_wants: string | null
          updated_at: string | null
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "public_listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_search_condition: { Args: { p_q: string }; Returns: string }
      catalog_search_ids: { Args: { p_q: string }; Returns: string[] }
      catalog_search_log_prune: { Args: never; Returns: number }
      catalog_search_logged: {
        Args: { manufacturer_hint?: string; query: string; source?: string }
        Returns: {
          candidates: Json
          created_at: string
          decision: string | null
          id: number
          latency_ms: number | null
          manufacturer_hint: string | null
          match_type: string | null
          product_id: string | null
          query_text: string
          reasons: string[] | null
          score: number | null
          source: string
          tier: string | null
          warning: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "catalog_search_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_suggest: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          brand: string
          kind: string
          listings: number
          model: string
        }[]
      }
      catalog_token_is_noise: {
        Args: { noise: string[]; p: number; toks: string[]; warn: string[] }
        Returns: boolean
      }
      catalog_type_counts: {
        Args: never
        Returns: {
          category: string
          instrument_type: string
          listings: number
        }[]
      }
      change_inventory_sku: {
        Args: {
          p_expected_version: number
          p_item_id: string
          p_new_sku: string
          p_reason: string
        }
        Returns: Json
      }
      claim_counter_purchase: { Args: { p_token: string }; Returns: Json }
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
      claim_mercadolibre_import_photos: {
        Args: { p_limit?: number; p_session_id: string }
        Returns: Json
      }
      claim_public_page_changes: {
        Args: { p_deployment?: string }
        Returns: string
      }
      claim_push_deliveries: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: Json
      }
      claim_service_booking: { Args: { p_service_id: string }; Returns: Json }
      claim_store_import_file_deletions: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          path: string
        }[]
      }
      claim_store_import_photo_deletions: {
        Args: { p_limit?: number; p_session_id?: string }
        Returns: {
          bucket: string
          path: string
        }[]
      }
      claim_store_import_step: { Args: { p_session_id: string }; Returns: Json }
      claim_upload_removals: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          path: string
        }[]
      }
      close_trade_request: {
        Args: {
          p_completed: boolean
          p_final_price_pen?: number
          p_reason?: string
          p_request_id: string
        }
        Returns: boolean
      }
      commit_store_import_chunk: {
        Args: {
          p_lock_token: string
          p_row_numbers: number[]
          p_session_id: string
        }
        Returns: Json
      }
      complete_dealer_authorization_upload: {
        Args: {
          p_document_bytes: number
          p_document_type: string
          p_id: string
          p_owner: string
          p_sha256: string
        }
        Returns: Json
      }
      complete_listing_submission: {
        Args: {
          p_details?: Json
          p_fields: Json
          p_id: string
          p_kind: string
          p_photos: Json
        }
        Returns: string
      }
      complete_marketplace_email_delivery: {
        Args: {
          p_delivery_id: string
          p_provider_message_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_public_page_changes: {
        Args: { p_claim: string; p_deployment: string; p_nonce: string }
        Returns: Json
      }
      complete_public_submission: {
        Args: { p_fields: Json; p_id: string; p_kind: string; p_photos: Json }
        Returns: string
      }
      complete_store_import_file_deletions: {
        Args: { p_paths: string[] }
        Returns: number
      }
      complete_store_import_photo_deletions: {
        Args: { p_paths: string[] }
        Returns: number
      }
      complete_upload_removals: {
        Args: { p_bucket: string; p_paths: string[] }
        Returns: number
      }
      confirm_listing_available: {
        Args: { p_listing_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_store_import_mapping: {
        Args: {
          p_expected_version: number
          p_mapping: Json
          p_save_as_default?: boolean
          p_session_id: string
          p_stale_stock?: string
          p_update_scope?: string
        }
        Returns: Json
      }
      consume_rate_limit: {
        Args: {
          p_bucket: string
          p_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      copy_owned_listing: {
        Args: { p_listing_id: string; p_mode: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      count_trade_stores: {
        Args: { p_category: string; p_region: string }
        Returns: number
      }
      count_trade_stores_by_category: {
        Args: { p_region: string }
        Returns: Json
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
      create_consignment_invite: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      create_counter_purchase_code: {
        Args: { p_sale_key: string }
        Returns: Json
      }
      create_inventory_item: {
        Args: {
          p_fields: Json
          p_idempotency_key: string
          p_opening_quantity: number
        }
        Returns: Json
      }
      create_inventory_publish_selection: {
        Args: { p_item_ids: string[] }
        Returns: Json
      }
      create_my_recovery_codes: { Args: never; Returns: string[] }
      create_saved_search_alert: {
        Args: { p_filters: Json; p_frequency: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "saved_search_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_store_import_session: {
        Args: {
          p_file_bytes: number
          p_file_format: string
          p_file_name: string
        }
        Returns: Json
      }
      create_trade_request: {
        Args: { p_fields: Json; p_id: string }
        Returns: Json
      }
      create_transaction_claim: {
        Args: { p_buyer_user_id: string; p_listing_id: string }
        Returns: string
      }
      dealer_document_upload_allowed: {
        Args: { p_name: string }
        Returns: boolean
      }
      decide_catalog_review: {
        Args: {
          p_note?: string
          p_pair_key: string
          p_source?: string
          p_variant_name?: string
          p_verdict: string
        }
        Returns: Json
      }
      decide_purchase_checkin: {
        Args: { p_checkin_id: string; p_confirmed: boolean }
        Returns: Json
      }
      delete_gear_item: { Args: { p_id: string }; Returns: boolean }
      delete_inventory_view: { Args: { p_view_id: string }; Returns: Json }
      delete_listing_price_steps: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      delete_push_subscription: {
        Args: { p_endpoint?: string; p_subscription_id?: string }
        Returns: boolean
      }
      delete_saved_search_alert: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
      delete_service: { Args: { p_service_id: string }; Returns: boolean }
      disconnect_einvoice: { Args: never; Returns: Json }
      disconnect_mercadolibre: { Args: never; Returns: Json }
      edit_store_import_cell: {
        Args: {
          p_expected_version: number
          p_field: string
          p_row_number: number
          p_session_id: string
          p_value: string
        }
        Returns: Json
      }
      end_consignment: { Args: { p_consignment_id: string }; Returns: boolean }
      export_my_data: { Args: never; Returns: Json }
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
      fail_store_import: {
        Args: {
          p_code: string
          p_lock_token: string
          p_message: string
          p_session_id: string
        }
        Returns: Json
      }
      finish_mercadolibre_import_photo: {
        Args: {
          p_asset_id: string
          p_failure: string
          p_id: string
          p_status: string
        }
        Returns: undefined
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
      finish_store_import_commit: {
        Args: { p_lock_token: string; p_session_id: string }
        Returns: Json
      }
      finish_store_import_parse: {
        Args: { p_lock_token: string; p_meta: Json; p_session_id: string }
        Returns: Json
      }
      finish_store_import_validation: {
        Args: { p_lock_token: string; p_session_id: string }
        Returns: Json
      }
      gear_reminder_kind: {
        Args: { p_instrument_type: string }
        Returns: string
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
      get_account_follows: { Args: never; Returns: Json }
      get_account_pendientes: { Args: never; Returns: Json }
      get_account_search_alerts: { Args: { p_since?: string }; Returns: Json }
      get_active_dealer_authorizations: { Args: never; Returns: Json }
      get_admin_app_errors: {
        Args: { p_days?: number; p_source?: string }
        Returns: Json
      }
      get_admin_artists: { Args: never; Returns: Json }
      get_admin_audit_history: {
        Args: { p_limit?: number; p_target_id: string; p_target_type: string }
        Returns: Json
      }
      get_admin_complaints_book_page: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_counter_purchases: {
        Args: { p_page?: number; p_page_size?: number }
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
      get_admin_makers: { Args: never; Returns: Json }
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
      get_admin_review_photo_queue: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_review_queue: { Args: never; Returns: Json }
      get_admin_safe_spots: { Args: never; Returns: Json }
      get_admin_service_counts: { Args: never; Returns: Json }
      get_admin_service_queue: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_view?: string
        }
        Returns: Json
      }
      get_admin_store_installment_offers: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_store_payment_methods: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_store_requests: {
        Args: { p_status?: string; p_store_id?: string }
        Returns: Json
      }
      get_app_health: { Args: never; Returns: Json }
      get_buyer_card: { Args: { p_token: string }; Returns: Json }
      get_campaign_listing_options: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      get_catalog_review_decisions: { Args: never; Returns: Json }
      get_catalog_review_queue: {
        Args: {
          p_brand?: string
          p_filter?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
        }
        Returns: Json
      }
      get_consignment_invite: { Args: { p_token: string }; Returns: Json }
      get_counter_index: { Args: never; Returns: Json }
      get_counter_purchase: { Args: { p_token: string }; Returns: Json }
      get_counter_purchase_code_status: {
        Args: { p_sale_id: string }
        Returns: Json
      }
      get_counter_transaction_center: { Args: never; Returns: Json }
      get_counter_transaction_detail: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      get_demand_report: { Args: { p_month?: string }; Returns: Json }
      get_einvoice_settings: { Args: never; Returns: Json }
      get_eligible_transaction_buyers: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_favorite_destination: {
        Args: { p_listing_id: string }
        Returns: string
      }
      get_feed_items: {
        Args: { p_after?: string; p_limit?: number; p_store_slug?: string }
        Returns: {
          brand: string
          category: string
          condition: string
          description: string
          id: string
          instrument_type: string
          model: string
          out_of_stock: boolean
          photos: string[]
          price_pen: number
          seller_key: string
          slug: string
          title: string
          updated_at: string
        }[]
      }
      get_followed_arrivals: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      get_gift_exchange_stores: { Args: { p_limit?: number }; Returns: Json }
      get_inventory_category_counts: { Args: never; Returns: Json }
      get_inventory_item_ids: { Args: { p_filters?: Json }; Returns: Json }
      get_inventory_item_serials: {
        Args: { p_item_id: string }
        Returns: string[]
      }
      get_inventory_neighbors: {
        Args: { p_filters?: Json; p_item_id: string }
        Returns: Json
      }
      get_inventory_page: {
        Args: { p_cursor?: Json; p_filters?: Json; p_limit?: number }
        Returns: Json
      }
      get_inventory_summary: { Args: never; Returns: Json }
      get_listing_consignment: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_locations: {
        Args: { p_listing_id: string }
        Returns: {
          city: string
          district: string
          id: string
          name: string
          opening_hours: string
          pickup_enabled: boolean
          public_address: string
        }[]
      }
      get_listing_maker_form: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_marks: { Args: { p_listing_ids: string[] }; Returns: Json }
      get_listing_purchase_request: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_listing_questions: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_selling_public: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_listing_selling_tools: {
        Args: { p_listing_ids: string[] }
        Returns: Json
      }
      get_listing_serial: { Args: { p_listing_id: string }; Returns: string }
      get_listing_statistics: { Args: { p_days?: number }; Returns: Json }
      get_listing_stock_watch: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      get_listing_trust: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_tryout_slots: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_live_campaign_marks: { Args: never; Returns: Json }
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
      get_mercadolibre_connection: { Args: never; Returns: Json }
      get_mercadolibre_import_photos: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_mercadolibre_tokens: {
        Args: { p_owner_user_id: string }
        Returns: Json
      }
      get_my_consignments: { Args: never; Returns: Json }
      get_my_private_offer: { Args: { p_listing_id: string }; Returns: Json }
      get_my_provenance_options: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      get_my_review_photos: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      get_my_safe_spot: { Args: never; Returns: Json }
      get_my_seller_levels: { Args: never; Returns: Json }
      get_my_seller_page: { Args: never; Returns: Json }
      get_my_service: { Args: { p_service_id: string }; Returns: Json }
      get_my_service_bookings: { Args: never; Returns: Json }
      get_my_services: { Args: never; Returns: Json }
      get_my_track_record: { Args: never; Returns: Json }
      get_my_trade_request: { Args: { p_request_id: string }; Returns: Json }
      get_my_trade_requests: { Args: never; Returns: Json }
      get_new_listing_counts: {
        Args: { p_categories?: string[]; p_since: string }
        Returns: Json
      }
      get_or_create_favorite_share: { Args: never; Returns: string }
      get_out_of_stock_demand: { Args: { p_limit?: number }; Returns: Json }
      get_own_store: {
        Args: never
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
          map_latitude: number | null
          map_longitude: number | null
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
          public_map_latitude: number | null
          public_map_longitude: number | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          verification_lapsed_at: string | null
          verification_lapsed_from: Json | null
          website_url: string | null
          whatsapp_phone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_pending_buyer_confirmation_count: { Args: never; Returns: number }
      get_private_offer_audience: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_public_artists: {
        Args: { p_listings_per_artist?: number }
        Returns: Json
      }
      get_public_campaign: {
        Args: { p_limit?: number; p_offset?: number; p_slug: string }
        Returns: Json
      }
      get_public_campaigns: { Args: never; Returns: Json }
      get_public_listing_cards: {
        Args: { p_ids?: string[]; p_slugs?: string[] }
        Returns: Json
      }
      get_public_makers: {
        Args: { p_listings_per_maker?: number }
        Returns: Json
      }
      get_public_reputation: {
        Args: {
          p_limit?: number
          p_subject_store_id?: string
          p_subject_user_id?: string
        }
        Returns: Json
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
      get_public_seller_facts: { Args: { p_listing_id: string }; Returns: Json }
      get_public_service: {
        Args: { p_category: string; p_slug: string }
        Returns: Json
      }
      get_public_service_paths: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          path: string
          updated_at: string
        }[]
      }
      get_public_services: {
        Args: { p_filters?: Json; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_public_store_directory: {
        Args: never
        Returns: {
          average_rating: number
          city: string
          district: string
          id: string
          is_verified: boolean
          listing_count: number
          logo_url: string
          name: string
          region: string
          review_count: number
          slug: string
        }[]
      }
      get_public_store_locations: {
        Args: { p_store_id: string }
        Returns: {
          city: string
          district: string
          id: string
          is_primary: boolean
          name: string
          opening_hours: string
          pickup_enabled: boolean
          public_address: string
          region: string
        }[]
      }
      get_purchase_checkin: { Args: { p_listing_id: string }; Returns: Json }
      get_push_subscription: { Args: { p_endpoint: string }; Returns: string }
      get_reorder_list: { Args: never; Returns: Json }
      get_review_photo_object: { Args: { p_photo_id: string }; Returns: Json }
      get_safe_meetup_spots: {
        Args: { p_city: string; p_limit?: number; p_region: string }
        Returns: Json
      }
      get_seller_page: { Args: { p_slug: string }; Returns: Json }
      get_service_booking_candidates: {
        Args: { p_service_id: string }
        Returns: Json
      }
      get_service_directory_counts: {
        Args: { p_category?: string }
        Returns: Json
      }
      get_service_reviews: {
        Args: { p_limit?: number; p_offset?: number; p_service_id: string }
        Returns: Json
      }
      get_service_viewer_state: {
        Args: { p_service_id: string }
        Returns: Json
      }
      get_shared_favorite_list: { Args: { p_token: string }; Returns: Json }
      get_store_campaigns: { Args: never; Returns: Json }
      get_store_dealer_authorizations: { Args: never; Returns: Json }
      get_store_feed_header: { Args: { p_store_slug: string }; Returns: Json }
      get_store_feed_settings: { Args: never; Returns: Json }
      get_store_installment_offer: {
        Args: { p_store_id: string }
        Returns: Json
      }
      get_store_listing_allowance_detail: { Args: never; Returns: Json }
      get_store_listing_categories: {
        Args: { p_store_id: string }
        Returns: {
          category: string
          listing_count: number
        }[]
      }
      get_store_listing_consignment: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_store_listing_quota: { Args: { p_store_id?: string }; Returns: Json }
      get_store_locations: { Args: never; Returns: Json }
      get_store_maker_profile: { Args: { p_store_id: string }; Returns: Json }
      get_store_payment_methods: { Args: { p_store_id: string }; Returns: Json }
      get_store_purchase_request_count: { Args: never; Returns: number }
      get_store_purchase_requests: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      get_store_trade_inbox: { Args: never; Returns: Json }
      get_store_trade_request: { Args: { p_request_id: string }; Returns: Json }
      get_store_trust: { Args: { p_store_id: string }; Returns: Json }
      get_transaction_center: { Args: never; Returns: Json }
      get_transaction_detail: {
        Args: { p_reference_id: string }
        Returns: Json
      }
      hide_inventory_listings_bulk: {
        Args: { p_batch_key: string; p_item_ids: string[] }
        Returns: Json
      }
      hide_listing_question: {
        Args: { p_question_id: string; p_reason: string }
        Returns: Json
      }
      hide_out_of_stock_store_listings: {
        Args: { p_batch_key: string }
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
      join_campaign: {
        Args: {
          p_after_campaign: string
          p_campaign_id: string
          p_campaign_price: number
          p_listing_id: string
        }
        Returns: Json
      }
      link_inventory_listing: {
        Args: {
          p_expected_version: number
          p_item_id: string
          p_listing_id: string
          p_unit_price_pen?: number
        }
        Returns: Json
      }
      link_legacy_listing_owner: {
        Args: { p_listing_id: string; p_note: string; p_owner_user_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      link_listing_provenance: {
        Args: { p_listing_id: string; p_transaction_id: string }
        Returns: Json
      }
      list_my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          device_label: string
          ip: string
          is_current: boolean
          last_active_at: string
          session_id: string
          user_agent: string
        }[]
      }
      list_orphan_review_photos: {
        Args: { p_limit?: number }
        Returns: string[]
      }
      listing_accepts_direct_photo_edits: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_accepts_part_payment: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_attribute_keys_are_valid: {
        Args: { p_attributes: Json; p_instrument_type: string }
        Returns: boolean
      }
      listing_condition_is_valid: {
        Args: { p_condition: string; p_store?: boolean }
        Returns: boolean
      }
      listing_gone_hint: {
        Args: { p_slug: string }
        Returns: {
          category: string
          instrument_type: string
        }[]
      }
      listing_has_status: {
        Args: {
          expected_status: Database["public"]["Enums"]["listing_status"]
          listing_id: string
        }
        Returns: boolean
      }
      listing_is_paused: { Args: { p_paused_until: string }; Returns: boolean }
      listing_is_public: { Args: { p_listing_id: string }; Returns: boolean }
      listing_matches_query: {
        Args: { p_query: string; p_text: string }
        Returns: boolean
      }
      listing_meets_publish_requirements: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_owner_can_edit: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_photo_count:
        | {
            Args: { "": Database["public"]["Tables"]["listings"]["Row"] }
            Returns: {
              error: true
            } & "the function public.listing_photo_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Views"]["public_listings"]["Row"] }
            Returns: {
              error: true
            } & "the function public.listing_photo_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
      listing_photo_set_is_valid: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: boolean
      }
      listing_price_step_next: {
        Args: { p_floor: number; p_percent: number; p_price: number }
        Returns: number
      }
      listing_review_wait_minutes: { Args: never; Returns: number }
      listing_search_text: {
        Args: {
          p_brand: string
          p_category: string
          p_instrument_type: string
          p_model: string
          p_title: string
        }
        Returns: string
      }
      listing_taxonomy_is_valid: {
        Args: { p_category: string; p_instrument_type: string }
        Returns: boolean
      }
      listings_needing_fingerprints: {
        Args: { p_limit?: number }
        Returns: Json
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_gear_reminder_done: { Args: { p_gear_id: string }; Returns: string }
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
          service_id: string | null
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
      mark_store_purchase_request: {
        Args: { p_event_id: string; p_status: string }
        Returns: Json
      }
      merge_device_favorites: { Args: { p_ids: string[] }; Returns: number }
      moderate_report: {
        Args: { p_reason: string; p_report_id: string; p_status: string }
        Returns: {
          created_at: string
          detail: string | null
          id: string
          listing_id: string | null
          question_id: string | null
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
      moderate_review_photo: {
        Args: { p_photo_id: string; p_reason?: string; p_status: string }
        Returns: string
      }
      my_account_deletion_check: { Args: never; Returns: Json }
      my_help_tickets: { Args: never; Returns: Json }
      my_stolen_reports: { Args: never; Returns: Json }
      my_two_step_requirement: { Args: never; Returns: Json }
      my_upload_allowance: { Args: { p_bucket: string }; Returns: Json }
      order_store_import_photos: {
        Args: {
          p_asset_ids: string[]
          p_row_number: number
          p_session_id: string
        }
        Returns: Json
      }
      pause_listing_price_steps: {
        Args: { p_listing_id: string; p_paused: boolean }
        Returns: Json
      }
      place_store_import_photo: {
        Args: { p_asset_id: string; p_row_number: number; p_session_id: string }
        Returns: Json
      }
      plan_store_import_rows: {
        Args: { p_lock_token: string; p_rows: Json; p_session_id: string }
        Returns: Json
      }
      prepare_daily_search_alert_emails: {
        Args: { p_digest_date: string; p_limit?: number }
        Returns: number
      }
      prepare_sign_out_everywhere: { Args: never; Returns: number }
      prepare_store_receipt: { Args: { p_fields: Json }; Returns: Json }
      prepare_weekly_follow_emails: {
        Args: { p_limit?: number; p_week_start: string }
        Returns: number
      }
      preview_inventory_price_bulk: {
        Args: { p_item_ids: string[]; p_mode: string; p_value: number }
        Returns: Json
      }
      preview_inventory_price_campaign: {
        Args: {
          p_item_ids: string[]
          p_mode: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      publish_held_review: { Args: { p_review_id: string }; Returns: boolean }
      publish_store_import_rows: {
        Args: {
          p_owner_user_id: string
          p_rows: Json
          p_rules_accepted: boolean
          p_session_id: string
        }
        Returns: Json
      }
      recent_price_drop_at:
        | {
            Args: { p_listing: Database["public"]["Tables"]["listings"]["Row"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.recent_price_drop_at(p_listing => listings), public.recent_price_drop_at(p_listing => public_listings). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: {
              p_listing: Database["public"]["Views"]["public_listings"]["Row"]
            }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.recent_price_drop_at(p_listing => listings), public.recent_price_drop_at(p_listing => public_listings). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      record_app_error: {
        Args: {
          p_client?: string
          p_digest?: string
          p_kind: string
          p_message: string
          p_name: string
          p_route: string
          p_source: string
        }
        Returns: string
      }
      record_external_sale: { Args: { p_listing_id: string }; Returns: string }
      record_location_stock_movement: {
        Args: {
          p_channel?: string
          p_expected_version?: number
          p_idempotency_key?: string
          p_item_id: string
          p_location_id: string
          p_quantity: number
          p_reason?: string
          p_reference?: string
          p_type: string
        }
        Returns: Json
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
      record_marketplace_events: {
        Args: { p_actor_user_id?: string; p_events: Json; p_session_id: string }
        Returns: Json
      }
      record_mercadolibre_import_photos: {
        Args: { p_photos: Json; p_session_id: string }
        Returns: Json
      }
      record_purchase_request_sale: {
        Args: {
          p_event_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_quantity: number
        }
        Returns: Json
      }
      record_service_event: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
          p_kind: string
          p_service_id: string
          p_session_id: string
        }
        Returns: Json
      }
      record_sign_in_device: {
        Args: { p_device_hash: string; p_label: string }
        Returns: Json
      }
      record_stock_movement: {
        Args: {
          p_channel?: string
          p_expected_version?: number
          p_idempotency_key?: string
          p_item_id: string
          p_quantity: number
          p_reason?: string
          p_reference?: string
          p_type: string
        }
        Returns: Json
      }
      record_store_import_photo_checks: {
        Args: { p_owner_user_id: string; p_results: Json; p_session_id: string }
        Returns: Json
      }
      record_store_receipt_result: {
        Args: { p_receipt_id: string; p_result: Json }
        Returns: Json
      }
      release_store_import_step: {
        Args: { p_lock_token: string; p_session_id: string }
        Returns: undefined
      }
      relist_sold_listing: {
        Args: { p_listing_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_store_import: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      replace_listing_photos: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: undefined
      }
      report_review: {
        Args: { p_detail?: string; p_reason: string; p_review_id: string }
        Returns: string
      }
      request_dealer_authorization_upload: {
        Args: {
          p_brand: string
          p_file_bytes: number
          p_file_name: string
          p_file_type: string
          p_note?: string
          p_valid_until?: string
        }
        Returns: Json
      }
      request_service_booking: {
        Args: { p_client_user_id: string; p_service_id: string }
        Returns: Json
      }
      request_store_admin_help: {
        Args: {
          p_kind: string
          p_message?: string
          p_requested_allowance?: number
        }
        Returns: Json
      }
      request_store_import_photo_uploads: {
        Args: { p_files: Json; p_session_id: string }
        Returns: Json
      }
      request_store_receipt_void: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: Json
      }
      request_store_tryout: {
        Args: {
          p_buyer_name: string
          p_buyer_phone: string
          p_listing_id: string
          p_note: string
          p_request_key: string
          p_starts_at: string
        }
        Returns: Json
      }
      reset_store_import_photo_matching: {
        Args: { p_session_id: string }
        Returns: Json
      }
      respond_service_booking: {
        Args: { p_accept: boolean; p_booking_id: string }
        Returns: Json
      }
      respond_store_tryout: {
        Args: { p_action: string; p_reason?: string; p_tryout_id: string }
        Returns: Json
      }
      respond_transaction_claim: {
        Args: { p_claim_id: string; p_confirmed: boolean }
        Returns: Json
      }
      restore_listing_question: {
        Args: { p_question_id: string; p_reason: string }
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
          map_latitude: number | null
          map_longitude: number | null
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
          public_map_latitude: number | null
          public_map_longitude: number | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          verification_lapsed_at: string | null
          verification_lapsed_from: Json | null
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
      revert_inventory_price_campaign: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      review_listing: {
        Args: {
          p_decision: string
          p_listing_id: string
          p_reason?: string
          p_reason_codes?: string[]
        }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
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
        SetofOptions: {
          from: "*"
          to: "listing_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_photo_upload_allowed: {
        Args: { p_name: string }
        Returns: boolean
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
          map_latitude: number | null
          map_longitude: number | null
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
          public_map_latitude: number | null
          public_map_longitude: number | null
          razon_social: string | null
          region: string
          rejection_reason: string | null
          ruc: string | null
          show_address: boolean
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          tiktok_url: string | null
          updated_at: string
          verification_lapsed_at: string | null
          verification_lapsed_from: Json | null
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
      revoke_favorite_share: { Args: never; Returns: boolean }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      run_campaign_job: { Args: never; Returns: Json }
      run_deal_trust_nightly: { Args: never; Returns: Json }
      run_demand_report_job: { Args: never; Returns: Json }
      run_selling_job: {
        Args: { p_job: string; p_limit?: number }
        Returns: Json
      }
      run_store_floor_daily: { Args: never; Returns: Json }
      save_einvoice_settings: { Args: { p_fields: Json }; Returns: Json }
      save_gear_item: {
        Args: { p_fields: Json; p_id: string }
        Returns: string
      }
      save_inventory_view: {
        Args: { p_filters: Json; p_name: string }
        Returns: Json
      }
      save_mercadolibre_connection: {
        Args: {
          p_access_token_enc: string
          p_expires_at: string
          p_ml_user_id: number
          p_nickname: string
          p_owner_user_id: string
          p_refresh_token_enc: string
          p_scope: string
        }
        Returns: Json
      }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: string
      }
      save_service: {
        Args: {
          p_expected_version?: number
          p_fields: Json
          p_service_id: string
        }
        Returns: Json
      }
      save_store_location: {
        Args: { p_fields: Json; p_location_id: string }
        Returns: Json
      }
      save_trade_offer: {
        Args: { p_amount_pen: number; p_note?: string; p_request_id: string }
        Returns: string
      }
      search_query_words: { Args: { p_query: string }; Returns: string[] }
      seller_verified_rank:
        | {
            Args: { p_listing: Database["public"]["Tables"]["listings"]["Row"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.seller_verified_rank(p_listing => listings), public.seller_verified_rank(p_listing => public_listings). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: {
              p_listing: Database["public"]["Views"]["public_listings"]["Row"]
            }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.seller_verified_rank(p_listing => listings), public.seller_verified_rank(p_listing => public_listings). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      send_private_offer: {
        Args: {
          p_days: number
          p_listing_id: string
          p_message?: string
          p_price_pen: number
        }
        Returns: Json
      }
      service_delete_account: { Args: { p_user_id: string }; Returns: Json }
      service_listings_fingerprint_state: {
        Args: { p_listing_ids: string[] }
        Returns: Json
      }
      service_photo_is_unused: { Args: { p_name: string }; Returns: boolean }
      service_record_listing_fingerprints: {
        Args: { p_items: Json; p_listing_id: string }
        Returns: Json
      }
      set_bundle_offer: {
        Args: {
          p_discount_percent: number
          p_min_items?: number
          p_store_id: string
        }
        Returns: {
          created_at: string
          discount_percent: number
          id: string
          min_items: number
          owner_user_id: string | null
          store_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_bundle_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_email_preferences: {
        Args: { p_follow_digest_emails: boolean; p_price_drop_emails: boolean }
        Returns: {
          follow_digest_emails: boolean
          price_drop_emails: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "email_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_favorite_note: {
        Args: { p_listing_id: string; p_note: string }
        Returns: string
      }
      set_follow: {
        Args: { p_brand: string; p_follow: boolean; p_store_id: string }
        Returns: boolean
      }
      set_gear_reminder: {
        Args: {
          p_every_months: number
          p_gear_id: string
          p_last_changed_on: string
        }
        Returns: string
      }
      set_inventory_arrival: {
        Args: { p_expected_on: string; p_item_ids: string[] }
        Returns: Json
      }
      set_inventory_item_category: {
        Args: {
          p_category: string
          p_expected_version: number
          p_item_id: string
        }
        Returns: Json
      }
      set_inventory_item_serials: {
        Args: { p_item_id: string; p_serials: string[] }
        Returns: number
      }
      set_inventory_preferences: {
        Args: { p_apply_to_unset?: boolean; p_fields: Json }
        Returns: Json
      }
      set_inventory_price_bulk: {
        Args: {
          p_batch_key: string
          p_item_ids: string[]
          p_mode: string
          p_value: number
        }
        Returns: Json
      }
      set_inventory_threshold_bulk: {
        Args: { p_batch_key: string; p_item_ids: string[]; p_threshold: number }
        Returns: Json
      }
      set_listing_companions: {
        Args: { p_companion_ids: string[]; p_listing_id: string }
        Returns: number
      }
      set_listing_favorite: {
        Args: { p_listing_id: string; p_saved: boolean }
        Returns: boolean
      }
      set_listing_maker_details: {
        Args: {
          p_artist_note?: string
          p_handmade: boolean
          p_listing_id: string
          p_made_to_order_weeks?: number
        }
        Returns: Json
      }
      set_listing_part_payment: {
        Args: { p_listing_id: string; p_value: boolean }
        Returns: boolean
      }
      set_listing_price_steps: {
        Args: {
          p_floor_pen: number
          p_interval_days: number
          p_listing_id: string
          p_only_without_contacts?: boolean
          p_step_percent: number
        }
        Returns: Json
      }
      set_listing_serial: {
        Args: { p_listing_id: string; p_serial: string }
        Returns: boolean
      }
      set_listing_stock_watch: {
        Args: { p_listing_id: string; p_watch: boolean }
        Returns: boolean
      }
      set_listing_store_terms: {
        Args: { p_listing_id: string; p_terms: Json }
        Returns: Json
      }
      set_location_stock_counts: {
        Args: { p_batch_key: string; p_counts: Json; p_location_id: string }
        Returns: Json
      }
      set_my_safe_spot: {
        Args: { p_enabled: boolean; p_note?: string }
        Returns: Json
      }
      set_my_seller_page_hidden: { Args: { p_hidden: boolean }; Returns: Json }
      set_my_stolen_report_status: {
        Args: { p_report_id: string; p_status: string }
        Returns: string
      }
      set_my_track_record: { Args: { p_enabled: boolean }; Returns: Json }
      set_own_store_map_pin: {
        Args: { p_latitude: number; p_longitude: number; p_store_id: string }
        Returns: undefined
      }
      set_owned_listing_lifecycle: {
        Args: { p_action: string; p_listing_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
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
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_owned_listings_lifecycle_bulk: {
        Args: { p_action: string; p_listing_ids: string[] }
        Returns: Json
      }
      set_owned_listings_pause: { Args: { p_until: string }; Returns: Json }
      set_primary_store_location: {
        Args: { p_location_id: string }
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
          name: string | null
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
      set_service_paused: {
        Args: { p_paused: boolean; p_service_id: string }
        Returns: Json
      }
      set_store_feed_enabled: { Args: { p_enabled: boolean }; Returns: Json }
      set_store_gift_policy: {
        Args: { p_days: number; p_note?: string }
        Returns: Json
      }
      set_store_import_row_publish_fields: {
        Args: { p_fields: Json; p_row_number: number; p_session_id: string }
        Returns: Json
      }
      set_store_import_rows_decision: {
        Args: {
          p_decision: string
          p_expected_version: number
          p_row_numbers: number[]
          p_session_id: string
        }
        Returns: Json
      }
      set_store_installments: {
        Args: {
          p_cards?: string[]
          p_interest_free?: boolean
          p_max_installments: number
          p_min_price_pen?: number
          p_note?: string
        }
        Returns: Json
      }
      set_store_maker_profile: {
        Args: {
          p_craft_city?: string
          p_kind: string
          p_since_year?: number
          p_story?: string
        }
        Returns: Json
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
      set_store_trade_settings: { Args: { p_fields: Json }; Returns: Json }
      set_store_tryout_settings: { Args: { p_fields: Json }; Returns: Json }
      set_store_verification: {
        Args: { p_store_id: string; p_verified: boolean }
        Returns: Json
      }
      set_store_warranty_policy: {
        Args: { p_condition_group: string; p_fields: Json }
        Returns: Json
      }
      stage_store_import_rows: {
        Args: { p_lock_token: string; p_rows: Json; p_session_id: string }
        Returns: Json
      }
      start_gear_sale: { Args: { p_id: string }; Returns: Json }
      start_store_import_commit: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      stop_gear_reminder: { Args: { p_gear_id: string }; Returns: boolean }
      stop_gear_reminders_by_link: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      storage_upload_allowed: {
        Args: { p_bucket: string; p_name: string }
        Returns: boolean
      }
      store_application_is_complete: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      submit_complaints_book_entry: {
        Args: {
          p_address: string
          p_claimed_amount: number
          p_complaint_type: string
          p_consumer_name: string
          p_declaration_accepted: boolean
          p_detail: string
          p_document_number: string
          p_document_type: string
          p_email: string
          p_guardian_name: string
          p_is_minor: boolean
          p_item_description: string
          p_item_type: string
          p_listing_slug: string
          p_phone: string
          p_request: string
        }
        Returns: {
          filed_at: string
          sheet_number: string
        }[]
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
      submit_help_ticket: {
        Args: {
          p_client_hash?: string
          p_email: string
          p_message: string
          p_name: string
          p_page_path?: string
          p_topic: string
        }
        Returns: Json
      }
      submit_listing_for_publication: {
        Args: { p_listing_id: string }
        Returns: {
          accepts_part_payment: boolean | null
          accepts_trades: boolean
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          can_try: boolean
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
          created_at: string
          created_by_source: string
          delivery_pickup: boolean
          description: string | null
          hidden_at: string | null
          hidden_reason: string | null
          hidden_source: string | null
          id: string
          installments_max: number | null
          instrument_type: string | null
          lima_delivery: string | null
          listing_flags: string[]
          marketplace_rules_accepted_at: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          pickup_area: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
          price_mode: string | null
          price_pen: number | null
          published_at: string | null
          region: string
          rejection_codes: string[] | null
          rejection_reason: string | null
          relisted_from_listing_id: string | null
          restock_expected_on: string | null
          returns_days: number | null
          returns_note: string | null
          seller_type: Database["public"]["Enums"]["seller_type"]
          shipping_carriers: string[]
          shipping_payment: string | null
          ships_provinces: boolean
          slug: string
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"]
          stock_state: string | null
          store_id: string | null
          store_terms_source: string | null
          title: string
          trade_categories: string[]
          trade_wants: string | null
          updated_at: string
          view_count: number | null
          warranty_months: number | null
          warranty_provider: string | null
          whatsapp_phone: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_service_report: {
        Args: {
          p_detail?: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      submit_service_review: {
        Args: { p_booking_id: string; p_comment?: string; p_rating: number }
        Returns: Json
      }
      submit_stolen_gear_report: {
        Args: {
          p_brand: string
          p_description: string
          p_model: string
          p_photos?: Json
          p_place: string
          p_police_report: string
          p_police_station: string
          p_serial: string
          p_stolen_on: string
        }
        Returns: Json
      }
      submit_transaction_review: {
        Args: { p_comment?: string; p_rating: number; p_transaction_id: string }
        Returns: string
      }
      trade_photo_folder_is_free: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      transfer_location_stock: {
        Args: {
          p_from: string
          p_idempotency_key?: string
          p_item_id: string
          p_quantity: number
          p_reason?: string
          p_to: string
        }
        Returns: Json
      }
      unarchive_inventory_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: Json
      }
      undo_inventory_batch: {
        Args: { p_batch_key: string; p_undo_key: string }
        Returns: Json
      }
      undo_stock_movements: {
        Args: { p_idempotency_key: string; p_movement_ids: string[] }
        Returns: Json
      }
      unlink_inventory_listing: {
        Args: {
          p_expected_version?: number
          p_item_id: string
          p_reason?: string
        }
        Returns: Json
      }
      unlink_listing_provenance: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      update_inventory_item: {
        Args: { p_expected_version: number; p_fields: Json; p_item_id: string }
        Returns: Json
      }
      update_inventory_listing_details: {
        Args: { p_details: Json; p_item_id: string }
        Returns: Json
      }
      update_mercadolibre_tokens: {
        Args: {
          p_access_token_enc: string
          p_expires_at: string
          p_previous_access_token_enc: string
          p_refresh_token_enc: string
          p_store_id: string
        }
        Returns: boolean
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
      update_owned_listing_details: {
        Args: { p_details: Json; p_listing_id: string }
        Returns: undefined
      }
      update_saved_search_alert: {
        Args: { p_alert_id: string; p_frequency: string; p_name: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "saved_search_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      use_my_recovery_code: { Args: { p_code: string }; Returns: boolean }
      withdraw_campaign_entry: { Args: { p_entry_id: string }; Returns: Json }
      withdraw_dealer_authorization: { Args: { p_id: string }; Returns: Json }
      withdraw_store_installments: { Args: never; Returns: Json }
      withdraw_store_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["store_payment_method"] }
        Returns: Json
      }
      withdraw_trade_offer: { Args: { p_offer_id: string }; Returns: boolean }
      withdraw_trade_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
    }
    Enums: {
      catalog_alias_type:
        | "official_alias"
        | "abbreviation"
        | "legacy_name"
        | "regional_name"
        | "seller_common_name"
        | "model_number"
        | "misspelling"
        | "punctuation_variant"
        | "manufacturer_prefixed"
        | "source_title"
        | "translation"
      catalog_authority_level:
        | "manufacturer"
        | "official_catalog"
        | "structured_public_database"
        | "encyclopedic_reference"
        | "specialist_reference"
        | "retailer"
        | "community"
        | "marketplace"
      catalog_review_status:
        | "pending"
        | "confirmed_same"
        | "confirmed_distinct"
        | "dismissed"
      catalog_verification_status:
        | "VERIFIED"
        | "PROBABLE"
        | "UNVERIFIED"
        | "CONFLICTING"
        | "REJECTED"
      inventory_status: "active" | "archived"
      listing_status:
        | "pending"
        | "approved"
        | "rejected"
        | "hidden"
        | "sold"
        | "draft"
        | "archived"
      seller_type: "individual" | "store"
      stock_channel:
        | "tienda_fisica"
        | "whatsapp_laria"
        | "redes_sociales"
        | "otro"
        | "panel"
        | "importacion"
        | "administracion"
        | "sistema"
        | "integracion"
      stock_movement_type:
        | "opening_balance"
        | "manual_adjustment"
        | "stock_count"
        | "sale"
        | "return"
        | "restock"
        | "damage_or_loss"
        | "import_reconciliation"
        | "reservation"
        | "reservation_release"
        | "external_sync"
        | "correction"
      stock_source: "manual" | "import" | "external"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      catalog_alias_type: [
        "official_alias",
        "abbreviation",
        "legacy_name",
        "regional_name",
        "seller_common_name",
        "model_number",
        "misspelling",
        "punctuation_variant",
        "manufacturer_prefixed",
        "source_title",
        "translation",
      ],
      catalog_authority_level: [
        "manufacturer",
        "official_catalog",
        "structured_public_database",
        "encyclopedic_reference",
        "specialist_reference",
        "retailer",
        "community",
        "marketplace",
      ],
      catalog_review_status: [
        "pending",
        "confirmed_same",
        "confirmed_distinct",
        "dismissed",
      ],
      catalog_verification_status: [
        "VERIFIED",
        "PROBABLE",
        "UNVERIFIED",
        "CONFLICTING",
        "REJECTED",
      ],
      inventory_status: ["active", "archived"],
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
      stock_channel: [
        "tienda_fisica",
        "whatsapp_laria",
        "redes_sociales",
        "otro",
        "panel",
        "importacion",
        "administracion",
        "sistema",
        "integracion",
      ],
      stock_movement_type: [
        "opening_balance",
        "manual_adjustment",
        "stock_count",
        "sale",
        "return",
        "restock",
        "damage_or_loss",
        "import_reconciliation",
        "reservation",
        "reservation_release",
        "external_sync",
        "correction",
      ],
      stock_source: ["manual", "import", "external"],
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
