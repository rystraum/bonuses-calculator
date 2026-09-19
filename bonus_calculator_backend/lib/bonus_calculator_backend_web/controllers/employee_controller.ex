defmodule BonusCalculatorBackendWeb.EmployeeController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.People
  alias BonusCalculatorBackend.People.Employee

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(People.list_employees(), &employee_json/1)})
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: employee_json(People.get_employee!(id))})
  end

  def create(conn, params) do
    with {:ok, %Employee{} = employee} <- People.create_employee(params) do
      conn
      |> put_status(:created)
      |> json(%{data: employee_json(employee)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    employee = People.get_employee!(id)

    with {:ok, %Employee{} = employee} <-
           People.update_employee(employee, params, conn.assigns.current_user) do
      json(conn, %{data: employee_json(employee)})
    end
  end

  def delete(conn, %{"id" => id}) do
    employee = People.get_employee!(id)

    with {:ok, %Employee{}} <- People.delete_employee(employee) do
      json(conn, %{data: %{id: id}})
    end
  end

  defp employee_json(employee) do
    %{
      id: employee.id,
      name: employee.name,
      classification: employee.classification,
      archived: not is_nil(employee.archived_at),
      archived_at: employee.archived_at,
      archived_by: user_json(employee.archived_by)
    }
  end

  defp user_json(%Ecto.Association.NotLoaded{}), do: nil
  defp user_json(nil), do: nil
  defp user_json(user), do: %{id: user.id, username: user.username}
end
