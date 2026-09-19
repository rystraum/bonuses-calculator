defmodule BonusCalculatorBackendWeb.SeedUploadController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.SeedImport

  def create(conn, params) do
    case SeedImport.import_payload(params, conn.assigns.current_user) do
      {:ok, stats} ->
        json(conn, %{data: stats})

      {:error, :unsupported_version} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "unsupported seed file version"})
    end
  end
end
