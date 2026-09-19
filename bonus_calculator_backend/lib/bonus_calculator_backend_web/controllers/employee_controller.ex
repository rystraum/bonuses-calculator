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

    with {:ok, %Employee{} = employee} <- People.update_employee(employee, params) do
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
    %{id: employee.id, name: employee.name}
  end
end
