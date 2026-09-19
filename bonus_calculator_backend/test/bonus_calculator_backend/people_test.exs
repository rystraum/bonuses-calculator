defmodule BonusCalculatorBackend.PeopleTest do
  use BonusCalculatorBackend.DataCase, async: true

  alias BonusCalculatorBackend.{Accounts, People}

  describe "employees" do
    test "create_employee/1 accepts each valid classification" do
      for classification <- ["full_time", "contractual", "professional"] do
        assert {:ok, employee} =
                 People.create_employee(%{
                   "name" => "Emp #{classification}",
                   "classification" => classification
                 })

        assert employee.classification == classification
        assert employee.archived_at == nil
      end
    end

    test "create_employee/1 allows a nil classification" do
      assert {:ok, employee} = People.create_employee(%{"name" => "Plain"})
      assert employee.classification == nil
    end

    test "create_employee/1 rejects an invalid classification" do
      assert {:error, changeset} =
               People.create_employee(%{"name" => "Bad", "classification" => "intern"})

      assert %{classification: ["is invalid"]} = errors_on(changeset)
    end

    test "update_employee/2 can change and clear the classification" do
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})

      assert {:ok, employee} =
               People.update_employee(employee, %{"classification" => "contractual"})

      assert employee.classification == "contractual"

      assert {:ok, employee} = People.update_employee(employee, %{"classification" => nil})
      assert employee.classification == nil
    end

    test "update_employee/2 rejects an invalid classification" do
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})

      assert {:error, changeset} =
               People.update_employee(employee, %{"classification" => "part_time"})

      assert %{classification: ["is invalid"]} = errors_on(changeset)
    end

    test "update_employee/2 archives and unarchives via the archived flag" do
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})
      assert employee.archived_at == nil

      assert {:ok, employee} = People.update_employee(employee, %{"archived" => true})
      assert %DateTime{} = employee.archived_at
      assert employee.archived_by_id == nil
      assert employee.archived_by == nil

      assert {:ok, employee} = People.update_employee(employee, %{"archived" => false})
      assert employee.archived_at == nil
      assert employee.archived_by_id == nil
    end

    test "update_employee/3 records who archived and clears it on unarchive" do
      {:ok, user} = Accounts.create_user(%{"username" => "archiver", "password" => "secret123"})
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})

      assert {:ok, employee} = People.update_employee(employee, %{"archived" => true}, user)
      assert %DateTime{} = employee.archived_at
      assert employee.archived_by_id == user.id
      assert employee.archived_by.username == "archiver"

      assert {:ok, employee} = People.update_employee(employee, %{"archived" => false}, user)
      assert employee.archived_at == nil
      assert employee.archived_by_id == nil
      assert employee.archived_by == nil
    end

    test "list_employees/0 and get_employee!/1 preload archived_by" do
      {:ok, user} = Accounts.create_user(%{"username" => "archiver", "password" => "secret123"})
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})
      {:ok, _} = People.update_employee(employee, %{"archived" => true}, user)

      listed = People.list_employees() |> Enum.find(&(&1.name == "Emp"))
      assert listed.archived_by.username == "archiver"
      assert People.get_employee!(employee.id).archived_by.username == "archiver"
    end

    test "update_employee/2 leaves archived_at alone when archived is not given" do
      {:ok, employee} = People.create_employee(%{"name" => "Emp"})
      {:ok, employee} = People.update_employee(employee, %{"archived" => true})

      assert {:ok, renamed} = People.update_employee(employee, %{"name" => "Renamed"})
      assert renamed.archived_at == employee.archived_at
    end
  end
end
