defmodule BonusCalculatorBackendWeb.EmployeeGroupController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Groups
  alias BonusCalculatorBackend.Groups.{EmployeeGroup, EmployeeGroupMembership}

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Groups.list_employee_groups(), &group_json/1)})
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: group_json(Groups.get_employee_group!(id))})
  end

  def create(conn, params) do
    with {:ok, %EmployeeGroup{} = group} <- Groups.create_employee_group(params) do
      conn
      |> put_status(:created)
      |> json(%{data: group_json(%{group | employees: []})})
    end
  end

  def update(conn, %{"id" => id} = params) do
    group = Groups.get_employee_group!(id)

    with {:ok, %EmployeeGroup{} = group} <- Groups.update_employee_group(group, params) do
      json(conn, %{data: group_json(group)})
    end
  end

  def delete(conn, %{"id" => id}) do
    group = Groups.get_employee_group!(id)

    with {:ok, %EmployeeGroup{}} <- Groups.delete_employee_group(group) do
      json(conn, %{data: %{id: id}})
    end
  end

  def add_member(conn, %{"id" => id, "employee_id" => employee_id}) do
    group = Groups.get_employee_group!(id)

    with {:ok, %EmployeeGroupMembership{}} <- Groups.add_member(group, employee_id) do
      conn
      |> put_status(:created)
      |> json(%{data: group_json(Groups.get_employee_group!(id))})
    end
  end

  def remove_member(conn, %{"id" => id, "employee_id" => employee_id}) do
    group = Groups.get_employee_group!(id)

    with {:ok, %EmployeeGroupMembership{}} <- Groups.remove_member(group, employee_id) do
      json(conn, %{data: group_json(Groups.get_employee_group!(id))})
    end
  end

  defp group_json(group) do
    employees =
      case group.employees do
        %Ecto.Association.NotLoaded{} -> []
        employees -> Enum.map(employees, &%{id: &1.id, name: &1.name})
      end

    %{id: group.id, name: group.name, employees: employees}
  end
end
