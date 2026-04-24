/**
 * Database type definitions for the Odi MRP system.
 *
 * These are written manually to match the schema in 001_initial_schema.sql.
 * Once you have the Supabase CLI set up, regenerate with:
 *
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.types.ts
 *
 * The generated file will replace this one and will be more precise.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }

      locations: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }

      user_profiles: {
        Row: {
          id: string
          full_name: string
          role_id: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          role_id: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          role_id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      products: {
        Row: {
          id: string
          sku_code: string
          name: string
          description: string | null
          unit_of_measure: string | null
          product_type: ProductGroup | null
          size_g: number | null
          hero_call_out: string | null
          back_of_pack: string | null
          serving_size: number | null
          rrp: number | null
          packaging: number | null
          toll: number | null
          margin: number | null
          other: number | null
          currency_exchange: number | null        // legacy; kept for one release
          freight: number | null
          apply_fx: boolean
          wastage_pct: number
          manufacturer: string | null
          opening_stock_override: number | null
          is_active: boolean
          deleted_at: string | null
          deleted_by: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          sku_code: string
          name: string
          description?: string | null
          unit_of_measure?: string | null
          product_type?: ProductGroup | null
          size_g?: number | null
          hero_call_out?: string | null
          back_of_pack?: string | null
          serving_size?: number | null
          rrp?: number | null
          packaging?: number | null
          toll?: number | null
          margin?: number | null
          other?: number | null
          currency_exchange?: number | null
          freight?: number | null
          apply_fx?: boolean
          wastage_pct?: number
          manufacturer?: string | null
          opening_stock_override?: number | null
          is_active?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          sku_code?: string
          name?: string
          description?: string | null
          unit_of_measure?: string | null
          product_type?: ProductGroup | null
          size_g?: number | null
          hero_call_out?: string | null
          back_of_pack?: string | null
          serving_size?: number | null
          rrp?: number | null
          packaging?: number | null
          toll?: number | null
          margin?: number | null
          other?: number | null
          currency_exchange?: number | null
          freight?: number | null
          apply_fx?: boolean
          wastage_pct?: number
          manufacturer?: string | null
          opening_stock_override?: number | null
          is_active?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }

      ingredients: {
        Row: {
          id: string
          sku_code: string
          name: string
          description: string | null
          unit_of_measure: string | null
          cost_per_unit: number | null
          reorder_point: number | null
          confirmed_supplier: string | null           // legacy text; prefer supplier_id
          supplier_id: string | null
          lead_time: string | null
          status: 'confirmed' | 'pending' | 'inactive'
          price: number | null
          freight: number | null
          total_loaded_cost: number | null
          is_organic: boolean
          is_active: boolean
          opening_stock_override: number | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          sku_code: string
          name: string
          description?: string | null
          unit_of_measure?: string | null
          cost_per_unit?: number | null
          reorder_point?: number | null
          confirmed_supplier?: string | null
          supplier_id?: string | null
          lead_time?: string | null
          status?: 'confirmed' | 'pending' | 'inactive'
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          is_organic?: boolean
          is_active?: boolean
          opening_stock_override?: number | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          sku_code?: string
          name?: string
          description?: string | null
          unit_of_measure?: string | null
          cost_per_unit?: number | null
          reorder_point?: number | null
          confirmed_supplier?: string | null
          supplier_id?: string | null
          lead_time?: string | null
          status?: 'confirmed' | 'pending' | 'inactive'
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          is_organic?: boolean
          is_active?: boolean
          opening_stock_override?: number | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }

      ingredient_price_history: {
        Row: {
          id: string
          ingredient_id: string
          price: number | null
          freight: number | null
          total_loaded_cost: number | null
          change_reason: PriceChangeReason
          changed_by: string | null
          changed_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          ingredient_id: string
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          change_reason?: PriceChangeReason
          changed_by?: string | null
          changed_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          change_reason?: PriceChangeReason
          changed_by?: string | null
          changed_at?: string
          notes?: string | null
        }
        Relationships: []
      }

      demand_forecasts: {
        Row: {
          id: string
          product_id: string
          year_month: string
          channel: DemandChannel
          units: number
          is_edited: boolean
          source: string
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          year_month: string
          channel: DemandChannel
          units?: number
          is_edited?: boolean
          source?: string
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          year_month?: string
          channel?: DemandChannel
          units?: number
          is_edited?: boolean
          source?: string
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      production_plans: {
        Row: {
          id: string
          product_id: string
          year_month: string
          units_planned: number
          notes: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          year_month: string
          units_planned?: number
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          year_month?: string
          units_planned?: number
          notes?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      app_settings: {
        Row: {
          id: number
          fx_rate: number
          gst_nz_pct: number
          gst_au_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          fx_rate?: number
          gst_nz_pct?: number
          gst_au_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          fx_rate?: number
          gst_nz_pct?: number
          gst_au_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }

      boms: {
        Row: {
          id: string
          product_id: string
          version: number
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          product_id: string
          version?: number
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          version?: number
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }

      bom_items: {
        Row: {
          id: string
          bom_id: string
          ingredient_id: string
          quantity_g: number
          uom: string
          price_override: number | null
          notes: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bom_id: string
          ingredient_id: string
          quantity_g: number
          uom?: string
          price_override?: number | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bom_id?: string
          ingredient_id?: string
          quantity_g?: number
          uom?: string
          price_override?: number | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      suppliers: {
        Row: {
          id: string
          code: string
          name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          country_of_origin: string | null
          country_of_purchase: string | null
          currency: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          country_of_origin?: string | null
          country_of_purchase?: string | null
          currency?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          code?: string
          name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          country_of_origin?: string | null
          country_of_purchase?: string | null
          currency?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }

      purchase_orders: {
        Row: {
          id: string
          po_number: string
          supplier_id: string
          status: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
          order_date: string
          expected_delivery_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          po_number: string
          supplier_id: string
          status?: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
          order_date?: string
          expected_delivery_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          po_number?: string
          supplier_id?: string
          status?: 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'
          order_date?: string
          expected_delivery_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }

      purchase_order_lines: {
        Row: {
          id: string
          purchase_order_id: string
          ingredient_id: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number | null
          unit_of_measure: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          purchase_order_id: string
          ingredient_id: string
          quantity_ordered: number
          quantity_received?: number
          unit_cost?: number | null
          unit_of_measure: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          purchase_order_id?: string
          ingredient_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number | null
          unit_of_measure?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      inventory_balances: {
        Row: {
          id: string
          ingredient_id: string
          location_id: string
          quantity_on_hand: number
          last_movement_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          location_id: string
          quantity_on_hand?: number
          last_movement_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          location_id?: string
          quantity_on_hand?: number
          last_movement_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      stock_movements: {
        Row: {
          id: string
          ingredient_id: string
          location_id: string
          movement_type:
            | 'purchase_received'
            | 'production_consumed'
            | 'opening_balance'
            | 'adjustment'
            | 'wastage'
            | 'correction'
            | 'transfer_in'
            | 'transfer_out'
          quantity: number
          unit_of_measure: string
          reference_type: 'purchase_order' | 'production_run' | 'manual' | 'transfer' | null
          purchase_order_line_id: string | null
          unit_cost: number | null
          notes: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          ingredient_id: string
          location_id: string
          movement_type:
            | 'purchase_received'
            | 'production_consumed'
            | 'opening_balance'
            | 'adjustment'
            | 'wastage'
            | 'correction'
            | 'transfer_in'
            | 'transfer_out'
          quantity: number
          unit_of_measure: string
          reference_type?: 'purchase_order' | 'production_run' | 'manual' | 'transfer' | null
          purchase_order_line_id?: string | null
          unit_cost?: number | null
          notes?: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string
          location_id?: string
          movement_type?:
            | 'purchase_received'
            | 'production_consumed'
            | 'opening_balance'
            | 'adjustment'
            | 'wastage'
            | 'correction'
            | 'transfer_in'
            | 'transfer_out'
          quantity?: number
          unit_of_measure?: string
          reference_type?: 'purchase_order' | 'production_run' | 'manual' | 'transfer' | null
          purchase_order_line_id?: string | null
          unit_cost?: number | null
          notes?: string
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }

    Enums: {
      [_ in never]: never
    }
  }
}

// ============================================================
// Convenience type aliases
// Use these throughout the app instead of the verbose Database types.
// ============================================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Entity aliases
export type Role             = Tables<'roles'>
export type Location         = Tables<'locations'>
export type UserProfile      = Tables<'user_profiles'>
export type Product          = Tables<'products'>
export type Ingredient       = Tables<'ingredients'>
export type IngredientPriceHistory = Tables<'ingredient_price_history'>
export type AppSettings      = Tables<'app_settings'>
export type DemandForecast   = Tables<'demand_forecasts'>
export type ProductionPlan   = Tables<'production_plans'>
export type Bom              = Tables<'boms'>
export type BomItem          = Tables<'bom_items'>
export type Supplier         = Tables<'suppliers'>
export type PurchaseOrder    = Tables<'purchase_orders'>
export type PurchaseOrderLine = Tables<'purchase_order_lines'>
export type InventoryBalance = Tables<'inventory_balances'>
export type StockMovement    = Tables<'stock_movements'>

// Domain-specific union types (match DB CHECK constraints)
export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'partially_received'
  | 'received'
  | 'cancelled'

export type MovementType =
  | 'purchase_received'
  | 'production_consumed'
  | 'opening_balance'
  | 'adjustment'
  | 'wastage'
  | 'correction'
  | 'transfer_in'
  | 'transfer_out'

export type ReferenceType =
  | 'purchase_order'
  | 'production_run'
  | 'manual'
  | 'transfer'

export type ProductGroup =
  | 'pouches'
  | 'snacks_4bs'
  | 'puffs_melts'
  | 'tubs'
  | 'sachets'
  | 'noodles'
  | 'vitamin_d'

export type PriceChangeReason =
  | 'initial'
  | 'manual_update'
  | 'import'
  | 'po_received'
  | 'correction'

export type DemandChannel =
  | 'ecomm_nz'
  | 'retail_nz'
  | 'ecomm_au'
  | 'retail_au'
  | 'pipefill'

// Commonly used joined types
export type UserProfileWithRole = UserProfile & {
  roles: Role
}

export type PurchaseOrderWithSupplier = PurchaseOrder & {
  suppliers: Pick<Supplier, 'id' | 'name' | 'code'>
}

export type IngredientStatus = 'confirmed' | 'pending' | 'inactive'

// BOM item joined with its ingredient — used throughout BOM views/editor
export type BomItemWithIngredient = BomItem & {
  ingredients: Pick<
    Ingredient,
    'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'total_loaded_cost' | 'is_organic'
  >
}

export type BomWithItems = Bom & {
  bom_items: BomItemWithIngredient[]
}

// Product with its active BOM + items — full detail view
export type ProductWithBom = Product & {
  boms: Array<BomWithItems>
}

export type InventoryBalanceWithIngredient = InventoryBalance & {
  ingredients: Pick<Ingredient, 'id' | 'name' | 'sku_code' | 'unit_of_measure' | 'reorder_point'>
}

// Ingredient with its linked supplier — used on detail and edit pages
export type IngredientWithSupplier = Ingredient & {
  suppliers: Pick<
    Supplier,
    | 'id'
    | 'code'
    | 'name'
    | 'contact_name'
    | 'email'
    | 'phone'
    | 'country_of_origin'
    | 'country_of_purchase'
    | 'currency'
  > | null
}

// Calculated cost summary — derived in app, never stored.
// `grand_total` is retained as an alias for `nz_grand_total` for
// backward compatibility with older callers.
export interface ProductCostSummary {
  ingredient_subtotal: number         // per-pack, before wastage
  ingredient_total_per_pack: number   // per-pack, after wastage
  serving_multiplier: number          // serving_size / size_g (1 if unset)
  ingredient_total: number            // per-serving, after wastage × serving multiplier
  base_cost: number                   // ingredient_total + packaging + toll + margin + other + freight
  nz_grand_total: number              // base_cost × fx_rate when apply_fx, else base_cost
  au_grand_total: number              // base_cost always
  rrp_ex_gst_nz: number               // rrp / (1 + gst_nz_pct)   — 0 when rrp not set
  rrp_ex_gst_au: number               // rrp / (1 + gst_au_pct)   — 0 when rrp not set
  cos_nz: number | null               // nz_grand_total / rrp_ex_gst_nz (ratio)
  cos_au: number | null               // au_grand_total / rrp_ex_gst_au (ratio)
  gp_nz: number | null                // 1 - cos_nz (ratio)
  gp_au: number | null                // 1 - cos_au (ratio)
  gp_nz_amount: number | null         // rrp_ex_gst_nz - nz_grand_total (dollars)
  gp_au_amount: number | null         // rrp_ex_gst_au - au_grand_total (dollars)
  /** @deprecated use nz_grand_total */
  grand_total: number
  /** @deprecated use cos_nz */
  cos: number | null
  /** @deprecated use gp_nz */
  gp: number | null
}
