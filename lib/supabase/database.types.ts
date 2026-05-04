export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      listing_photos: {
        Row: {
          id: string;
          listing_id: string;
          image_url: string;
          alt_text: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          image_url: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          image_url?: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          id: string;
          store_id: string | null;
          seller_type: Database["public"]["Enums"]["seller_type"];
          status: Database["public"]["Enums"]["listing_status"];
          title: string;
          slug: string;
          description: string | null;
          category: string;
          brand: string | null;
          model: string | null;
          condition: string | null;
          price_pen: number | null;
          instrument_type: string | null;
          attributes: Json | null;
          published_at: string | null;
          view_count: number | null;
          city: string;
          region: string;
          contact_name: string | null;
          whatsapp_phone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          seller_type: Database["public"]["Enums"]["seller_type"];
          status?: Database["public"]["Enums"]["listing_status"];
          title: string;
          slug: string;
          description?: string | null;
          category: string;
          brand?: string | null;
          model?: string | null;
          condition?: string | null;
          price_pen?: number | null;
          instrument_type?: string | null;
          attributes?: Json | null;
          published_at?: string | null;
          view_count?: number | null;
          city: string;
          region?: string;
          contact_name?: string | null;
          whatsapp_phone: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          seller_type?: Database["public"]["Enums"]["seller_type"];
          status?: Database["public"]["Enums"]["listing_status"];
          title?: string;
          slug?: string;
          description?: string | null;
          category?: string;
          brand?: string | null;
          model?: string | null;
          condition?: string | null;
          price_pen?: number | null;
          instrument_type?: string | null;
          attributes?: Json | null;
          published_at?: string | null;
          view_count?: number | null;
          city?: string;
          region?: string;
          contact_name?: string | null;
          whatsapp_phone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      stores: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          status: Database["public"]["Enums"]["store_status"];
          listing_plan: Database["public"]["Enums"]["store_listing_plan"];
          contact_name: string | null;
          whatsapp_phone: string;
          city: string;
          region: string;
          district: string | null;
          address: string | null;
          instagram_url: string | null;
          facebook_url: string | null;
          logo_url: string | null;
          banner_url: string | null;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["store_status"];
          listing_plan?: Database["public"]["Enums"]["store_listing_plan"];
          contact_name?: string | null;
          whatsapp_phone: string;
          city: string;
          region?: string;
          district?: string | null;
          address?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["store_status"];
          listing_plan?: Database["public"]["Enums"]["store_listing_plan"];
          contact_name?: string | null;
          whatsapp_phone?: string;
          city?: string;
          region?: string;
          district?: string | null;
          address?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      listing_has_status: {
        Args: {
          listing_id: string;
          expected_status: Database["public"]["Enums"]["listing_status"];
        };
        Returns: boolean;
      };
    };
    Enums: {
      listing_status: "pending" | "approved" | "rejected" | "hidden" | "sold";
      seller_type: "individual" | "store";
      store_listing_plan: "free" | "starter_20" | "growth_50" | "pro_100";
      store_status: "pending" | "active" | "hidden";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
