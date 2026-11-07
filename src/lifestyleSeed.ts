// Mise en place de l'étiquette « Exceptionnel » pour l'indicateur « train de vie ».
// Une seule fois par utilisateur : on ajoute l'étiquette si elle manque et on la présélectionne comme
// « extraordinaire » si rien n'est encore choisi. Ensuite l'utilisateur est libre de la supprimer ou de
// la décocher : on ne la remet jamais. Module pur ; l'écriture est faite par api.ts.
import type { Tag } from "./tagsUtils";

export const EXCEPTIONAL_TAG_ID = "exceptionnel";

export interface SeedPlan {
  addTag: boolean;      // créer l'étiquette dans la liste de l'utilisateur
  selectTag: boolean;   // la cocher comme « extraordinaire »
  markDone: boolean;    // enregistrer que la mise en place a eu lieu
}

const NOTHING: SeedPlan = { addTag: false, selectTag: false, markDone: false };

/**
 * @param tags            étiquettes de l'utilisateur lues dans le cloud (vide = pas encore prêt : on attend)
 * @param extraordinary   étiquettes déjà cochées comme extraordinaires
 * @param alreadySeeded   la mise en place a déjà eu lieu
 */
export function planExceptionalSeed(tags: Tag[], extraordinary: string[], alreadySeeded: boolean): SeedPlan {
  if (alreadySeeded || tags.length === 0) return NOTHING;
  return {
    addTag: !tags.some((t) => t.id === EXCEPTIONAL_TAG_ID),
    selectTag: extraordinary.length === 0,
    markDone: true,
  };
}
