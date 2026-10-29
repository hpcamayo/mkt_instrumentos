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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
          listing_photo_count: number | null
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
          content_changed_at?: string | null
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
          previous_price_pen?: number | null
          price_changed_at?: string | null
          price_dropped_at?: string | null
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
          content_changed_at?: string | null
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
          previous_price_pen?: number | null
          price_changed_at?: string | null
          price_dropped_at?: string | null
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
            foreignKeyName: "store_stock_movements_store_id_fkey"
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
          owner_user_id: string | null
          public_address: string | null
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
          name: string
          opening_hours?: string | null
          owner_user_id?: string | null
          public_address?: string | null
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
          name?: string
          opening_hours?: string | null
          owner_user_id?: string | null
          public_address?: string | null
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
          attributes: Json | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string | null
          content_changed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          instrument_type: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          previous_price_pen: number | null
          price_dropped_at: string | null
          price_pen: number | null
          published_at: string | null
          region: string | null
          seller_type: Database["public"]["Enums"]["seller_type"] | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          stock_state: string | null
          store_id: string | null
          title: string | null
          updated_at: string | null
          view_count: number | null
          listing_photo_count: number | null
        }
        Insert: {
          attributes?: Json | null
          availability_confirmed_at?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string | null
          content_changed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          instrument_type?: string | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          previous_price_pen?: number | null
          price_dropped_at?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"] | null
          slug?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          stock_state?: string | null
          store_id?: string | null
          title?: string | null
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          attributes?: Json | null
          availability_confirmed_at?: string | null
          brand?: string | null
          category?: string | null
          city?: string | null
          condition?: string | null
          content_changed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          instrument_type?: string | null
          model?: string | null
          owner_user_id?: string | null
          paused_until?: string | null
          previous_price_pen?: number | null
          price_dropped_at?: string | null
          price_pen?: number | null
          published_at?: string | null
          region?: string | null
          seller_type?: Database["public"]["Enums"]["seller_type"] | null
          slug?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          stock_state?: string | null
          store_id?: string | null
          title?: string | null
          updated_at?: string | null
          view_count?: number | null
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
      admin_anonymize_account: {
        Args: { p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_close_store_request: {
        Args: { p_note?: string; p_request_id: string; p_status: string }
        Returns: Json
      }
      admin_get_listing: {
        Args: { p_listing_id: string }
        Returns: {
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
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
      admin_set_store_inventory_enabled: {
        Args: { p_enabled: boolean; p_reason: string; p_store_id: string }
        Returns: Json
      }
      admin_set_store_listing_allowance: {
        Args: { p_allowance: number; p_reason: string; p_store_id: string }
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
      ask_listing_question: {
        Args: { p_body: string; p_listing_id: string }
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
          attributes: Json | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string | null
          city: string | null
          condition: string | null
          content_changed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          instrument_type: string | null
          model: string | null
          owner_user_id: string | null
          paused_until: string | null
          previous_price_pen: number | null
          price_dropped_at: string | null
          price_pen: number | null
          published_at: string | null
          region: string | null
          seller_type: Database["public"]["Enums"]["seller_type"] | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["listing_status"] | null
          stock_state: string | null
          store_id: string | null
          title: string | null
          updated_at: string | null
          view_count: number | null
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
      claim_public_page_changes: {
        Args: { p_deployment?: string }
        Returns: string
      }
      claim_push_deliveries: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: Json
      }
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
      commit_store_import_chunk: {
        Args: {
          p_lock_token: string
          p_row_numbers: number[]
          p_session_id: string
        }
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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_transaction_claim: {
        Args: { p_buyer_user_id: string; p_listing_id: string }
        Returns: string
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
      delete_inventory_view: { Args: { p_view_id: string }; Returns: Json }
      delete_push_subscription: {
        Args: { p_endpoint?: string; p_subscription_id?: string }
        Returns: boolean
      }
      delete_saved_search_alert: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
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
      get_admin_app_errors: {
        Args: { p_days?: number; p_source?: string }
        Returns: Json
      }
      get_admin_audit_history: {
        Args: { p_limit?: number; p_target_id: string; p_target_type: string }
        Returns: Json
      }
      get_admin_complaints_book_page: {
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
      get_admin_store_payment_methods: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      get_admin_store_requests: {
        Args: { p_status?: string; p_store_id?: string }
        Returns: Json
      }
      get_app_health: { Args: never; Returns: Json }
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
      get_counter_index: { Args: never; Returns: Json }
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
      get_inventory_category_counts: { Args: never; Returns: Json }
      get_inventory_item_ids: { Args: { p_filters?: Json }; Returns: Json }
      get_inventory_neighbors: {
        Args: { p_filters?: Json; p_item_id: string }
        Returns: Json
      }
      get_inventory_page: {
        Args: { p_cursor?: Json; p_filters?: Json; p_limit?: number }
        Returns: Json
      }
      get_inventory_summary: { Args: never; Returns: Json }
      get_listing_purchase_request: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_listing_questions: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_statistics: { Args: { p_days?: number }; Returns: Json }
      get_listing_stock_watch: {
        Args: { p_listing_id: string }
        Returns: boolean
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
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
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
      get_public_card_page: {
        Args: { p_after?: string | null }
        Returns: Json
      }
      get_public_listing_cards: {
        Args: { p_ids?: string[]; p_slugs?: string[] }
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
      get_purchase_checkin: { Args: { p_listing_id: string }; Returns: Json }
      get_push_subscription: { Args: { p_endpoint: string }; Returns: string }
      get_reorder_list: { Args: never; Returns: Json }
      get_shared_favorite_list: { Args: { p_token: string }; Returns: Json }
      get_store_listing_allowance_detail: { Args: never; Returns: Json }
      get_store_listing_categories: {
        Args: { p_store_id: string }
        Returns: {
          category: string
          listing_count: number
        }[]
      }
      get_store_listing_quota: { Args: { p_store_id?: string }; Returns: Json }
      get_store_payment_methods: { Args: { p_store_id: string }; Returns: Json }
      get_store_purchase_request_count: { Args: never; Returns: number }
      get_store_purchase_requests: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
      mark_all_notifications_read: { Args: never; Returns: number }
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
      my_upload_allowance: { Args: { p_bucket: string }; Returns: Json }
      order_store_import_photos: {
        Args: {
          p_asset_ids: string[]
          p_row_number: number
          p_session_id: string
        }
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
      record_purchase_request_sale: {
        Args: {
          p_event_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_quantity: number
        }
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
      release_store_import_step: {
        Args: { p_lock_token: string; p_session_id: string }
        Returns: undefined
      }
      relist_sold_listing: {
        Args: { p_listing_id: string }
        Returns: {
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
      reset_store_import_photo_matching: {
        Args: { p_session_id: string }
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
          name: string
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
          opening_hours: string | null
          owner_user_id: string | null
          public_address: string | null
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
      save_inventory_view: {
        Args: { p_filters: Json; p_name: string }
        Returns: Json
      }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
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
      set_inventory_item_category: {
        Args: {
          p_category: string
          p_expected_version: number
          p_item_id: string
        }
        Returns: Json
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
      set_listing_favorite: {
        Args: { p_listing_id: string; p_saved: boolean }
        Returns: boolean
      }
      set_listing_stock_watch: {
        Args: { p_listing_id: string; p_watch: boolean }
        Returns: boolean
      }
      set_owned_listing_lifecycle: {
        Args: { p_action: string; p_listing_id: string }
        Returns: {
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
      stage_store_import_rows: {
        Args: { p_lock_token: string; p_rows: Json; p_session_id: string }
        Returns: Json
      }
      start_store_import_commit: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
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
      submit_listing_for_publication: {
        Args: { p_listing_id: string }
        Returns: {
          archived_at: string | null
          attributes: Json | null
          availability_checkin_at: string | null
          availability_confirmed_at: string | null
          brand: string | null
          category: string
          city: string
          condition: string | null
          contact_name: string | null
          content_changed_at: string | null
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
          paused_until: string | null
          previous_price_pen: number | null
          price_changed_at: string | null
          price_dropped_at: string | null
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
      update_inventory_item: {
        Args: { p_expected_version: number; p_fields: Json; p_item_id: string }
        Returns: Json
      }
      update_inventory_listing_details: {
        Args: { p_details: Json; p_item_id: string }
        Returns: Json
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
      withdraw_store_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["store_payment_method"] }
        Returns: Json
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
