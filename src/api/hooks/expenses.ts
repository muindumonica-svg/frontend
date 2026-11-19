import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Expense, ExpenseList, ExpenseListFilters, RecordExpenseInput } from "@/types/api";
import { QueryKeys } from "./keys";

export function useExpenses(filters: ExpenseListFilters = {}) {
  return useQuery(
    queryOptions({
      queryKey: QueryKeys.expenses(filters),
      queryFn: ({ signal }) => apiFetch<ExpenseList>("/expenses", { query: filters, signal }),
    }),
  );
}

export function useRecordExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordExpenseInput) =>
      apiFetch<Expense>("/expenses", { method: "POST", body: input }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: QueryKeys.expensesRoot });
      client.invalidateQueries({ queryKey: QueryKeys.reportsRoot });
      client.invalidateQueries({ queryKey: QueryKeys.shiftsRoot });
    },
  });
}
