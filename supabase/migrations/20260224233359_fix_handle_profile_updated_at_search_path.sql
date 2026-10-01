
-- Fix mutable search_path security warning on handle_profile_updated_at
CREATE OR REPLACE FUNCTION public.handle_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
