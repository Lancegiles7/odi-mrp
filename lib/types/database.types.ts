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
          product_type: string | null
          size_g: number | null
          hero_call_out: string | null
          back_of_pack: string | null
          serving_size: number | null
          rrp: number | null
          packaging: number | null
          toll: number | null
          margin: number | null
          other: number | null
          currency_exchange: number | null
          freight: number | null
          is_active: boolean
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
          product_type?: string | null
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
          is_active?: boolean
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
          product_type?: string | null
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
          is_active?: boolean
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
          confirmed_supplier: string | null
          lead_time: string | null
          status: 'confirmed' | 'pending' | 'inactive'
          price: number | null
          freight: number | null
          total_loaded_cost: number | null
          is_organic: boolean
          is_active: boolean
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
          lead_time?: string | null
          status?: 'confirmed' | 'pending' | 'inactive'
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          is_organic?: boolean
          is_active?: boolean
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
          lead_time?: string | null
          status?: 'confirmed' | 'pending' | 'inactive'
          price?: number | null
          freight?: number | null
          total_loaded_cost?: number | null
          is_organic?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
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

// Calculated cost summary — derived in app, never stored
export interface ProductCostSummary {
  ingredient_total: number
  grand_total: number
  cos: number | null   // null if no RRP set
  gp: number | null
}
