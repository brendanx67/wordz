-- Allow game creators to delete their own games
CREATE POLICY "Creators can delete games" ON public.games
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Allow deleting game_players for games the user created
CREATE POLICY "Creators can delete game_players" ON public.game_players
  FOR DELETE TO authenticated
  USING (
    game_id IN (
      SELECT id FROM public.games WHERE created_by = (SELECT auth.uid())
    )
  );
