defmodule BonusCalculatorBackendWeb.FallbackController do
  use BonusCalculatorBackendWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: translate_errors(changeset)})
  end

  def call(conn, {:error, :not_drafted}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "distribution is not drafted"})
  end

  def call(conn, {:error, :invalid_transition}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "invalid status transition"})
  end

  def call(conn, {:error, :employee_group_not_found}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "employee group not found"})
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "not found"})
  end

  defp translate_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
