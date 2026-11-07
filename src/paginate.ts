// Supabase (PostgREST) renvoie au plus 1000 lignes par requête, et le fait sans erreur : une lecture « complète »
// d'une table plus grande est donc tronquée en silence. Ce helper lit page après page jusqu'à épuisement.
// L'appelant doit trier sur une colonne unique (ex. id) pour que les pages ne se chevauchent pas.

export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
  maxPages = 500, // garde-fou : 500 000 lignes
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
