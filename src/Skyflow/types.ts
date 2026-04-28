export type DeidentifyStringRequest = {
  text: string;
  vault_id: string;
  entity_types?: string[];
};

export type StringResponseEntityLocation = {
  start_index: number;
  end_index: number;
  start_index_processed?: number;
  end_index_processed?: number;
};

export type StringResponseEntity = {
  token?: string;
  value?: string;
  location?: StringResponseEntityLocation;
  entity_type?: string;
  entity_scores?: Record<string, number>;
};

export type DeidentifyStringResponse = {
  processed_text?: string;
  entities?: StringResponseEntity[];
  word_count?: number;
  character_count?: number;
};
