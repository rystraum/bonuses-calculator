defmodule BonusCalculatorBackendWeb.ShareholderController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.People
  alias BonusCalculatorBackend.People.Shareholder

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(People.list_shareholders(), &shareholder_json/1)})
  end

  def show(conn, %{"id" => id}) do
    shareholder =
      id
      |> People.get_shareholder!()
      |> BonusCalculatorBackend.Repo.preload(:employee)

    json(conn, %{data: shareholder_json(shareholder)})
  end

  def create(conn, params) do
    with {:ok, %Shareholder{} = shareholder} <- People.create_shareholder(params) do
      conn
      |> put_status(:created)
      |> json(%{data: shareholder_json(shareholder)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    shareholder = People.get_shareholder!(id)

    with {:ok, %Shareholder{} = shareholder} <- People.update_shareholder(shareholder, params) do
      json(conn, %{data: shareholder_json(shareholder)})
    end
  end

  def delete(conn, %{"id" => id}) do
    shareholder = People.get_shareholder!(id)

    with {:ok, %Shareholder{}} <- People.delete_shareholder(shareholder) do
      json(conn, %{data: %{id: id}})
    end
  end

  defp shareholder_json(shareholder) do
    employee_name =
      case shareholder.employee do
        %Ecto.Association.NotLoaded{} -> nil
        nil -> nil
        employee -> employee.name
      end

    %{
      id: shareholder.id,
      name: shareholder.name,
      shares: shareholder.shares,
      employee_id: shareholder.employee_id,
      employee_name: employee_name
    }
  end
end
